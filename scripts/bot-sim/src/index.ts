import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { appendPlanToCsv, initCsv, writeRawLog } from './csv'
import { openBrowser, driveSession } from './driver'
import {
  adaptivePlan,
  makeAccessibilityPlan,
  makePlan,
  seededRng,
  ADAPTIVE_JITTER,
  type AccessibilityPersona,
  type Persona,
  type SessionPlan,
} from './personas'

/**
 * Bot Behavior Simulator (SPEC §15 Phase 6). Generates persona event plans,
 * drives the real demo form in a headless browser so sessions land in the
 * gateway DB, and writes a labeled CSV + raw telemetry logs for training.
 *
 * Usage:
 *   bun src/index.ts --human 5 --naive 3 --jitter 2 --out out \
 *     --demo http://localhost:5173 --gateway http://localhost:8080
 */

interface Options {
  human: number
  naive: number
  jitter: number
  replay: number
  out: string
  demo: string
  gateway: string
  seed: number
  accessibility: boolean
  adaptive: number
  fold: boolean
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { human: 0, naive: 0, jitter: 0, replay: 0, out: 'out', demo: 'http://localhost:5173', gateway: 'http://localhost:8080', seed: 42, accessibility: false, adaptive: 0, fold: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = (): string => {
      const v = argv[i + 1]
      if (v === undefined) throw new Error(`missing value for ${flag}`)
      i++
      return v
    }
    switch (flag) {
      case '--human': opts.human = Number(value()); break
      case '--naive': opts.naive = Number(value()); break
      case '--jitter': opts.jitter = Number(value()); break
      case '--replay': opts.replay = Number(value()); break
      case '--out': opts.out = value(); break
      case '--demo': opts.demo = value(); break
      case '--gateway': opts.gateway = value(); break
      case '--seed': opts.seed = Number(value()); break
      case '--accessibility': opts.accessibility = true; break
      case '--adaptive': opts.adaptive = Number(value()); break
      case '--fold': opts.fold = true; break
      default: throw new Error(`unknown flag ${flag}`)
    }
  }
  return opts
}

async function initGatewaySession(gateway: string): Promise<string> {
  const res = await fetch(`${gateway}/stealthguard/session/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: '/login' }),
  })
  if (!res.ok) throw new Error(`session/init failed: ${res.status}`)
  const body = (await res.json()) as { session_id: string }
  return body.session_id
}

async function postTelemetry(gateway: string, sessionId: string, plan: SessionPlan): Promise<string> {
  const res = await fetch(`${gateway}/stealthguard/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      page: '/login',
      privacy_mode: 'raw',
      keystrokes: plan.keystrokes,
      mouse_moves: plan.mouse_moves,
      touch_moves: plan.touch_moves,
      clicks: plan.clicks,
      signals: plan.signals,
      meta: { input_modality: plan.signals?.input_modality },
    }),
  })
  if (!res.ok) throw new Error(`telemetry failed: ${res.status}`)
  const body = (await res.json()) as { decision?: string }
  return body.decision ?? ''
}

// Evasion threshold: if this fraction of adaptive sessions is classified
// human, we fold them back into training to harden the model (Phase 9 A4).
const EVASION_FOLD_THRESHOLD = 0.3

async function runAdaptive(opts: Options): Promise<void> {
  const csvPath = join(opts.out, 'sessions.csv')
  initCsv(csvPath)
  let evaded = 0
  for (let i = 0; i < opts.adaptive; i++) {
    const rng = seededRng(opts.seed + 900 + i)
    const plan = adaptivePlan(`adaptive-${i}`, rng, ADAPTIVE_JITTER)
    const gatewaySession = await initGatewaySession(opts.gateway)
    const decision = await postTelemetry(opts.gateway, gatewaySession, plan)
    console.log(`${plan.session_id} [adaptive] -> ${decision}`)
    if (decision === 'allow') evaded++
    writeRawLog(opts.out, plan)
    appendPlanToCsv(csvPath, plan) // labeled 'bot' — these are bots trying to pass
  }
  const evasion = opts.adaptive > 0 ? evaded / opts.adaptive : 0
  console.log(`adaptive evasion rate: ${(evasion * 100).toFixed(0)}% (${evaded}/${opts.adaptive})`)
  if (evasion > EVASION_FOLD_THRESHOLD && opts.fold) {
    const seedCsv = 'out/sessions.csv'
    const seedExists = existsSync(seedCsv)
    appendFileSync(seedCsv, readFileSync(csvPath, 'utf-8').split('\n').slice(1).join('\n') + '\n')
    console.log(`evasion above threshold — folded adaptive sessions into ${seedCsv}${seedExists ? ' (appended)' : ' (created)'}`)
  } else if (evasion > EVASION_FOLD_THRESHOLD) {
    console.log(`evasion above threshold ${EVASION_FOLD_THRESHOLD} — pass --fold to fold into training`)
  }
}

async function runAccessibility(opts: Options): Promise<void> {
  const personas: AccessibilityPersona[] = ['screen-reader', 'switch', 'tremor']
  for (const persona of personas) {
    const rng = seededRng(opts.seed + 777)
    const plan = makeAccessibilityPlan(persona, `a11y-${persona}`, rng)
    const gatewaySession = await initGatewaySession(opts.gateway)
    const decision = await postTelemetry(opts.gateway, gatewaySession, plan)
    console.log(`${plan.session_id} [${persona}] -> ${decision}`)
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.accessibility) {
    await runAccessibility(opts)
    return
  }
  if (opts.adaptive > 0) {
    await runAdaptive(opts)
    return
  }
  if (opts.human + opts.naive + opts.jitter + opts.replay === 0) {
    throw new Error('nothing to run; pass --human/--naive/--jitter/--replay counts, --accessibility, or --adaptive N')
  }
  const csvPath = join(opts.out, 'sessions.csv')
  initCsv(csvPath)

  const browser = await openBrowser()
  const captures: SessionPlan[] = []
  let index = 0

  try {
    const runPersona = async (kind: Persona | 'replay', count: number): Promise<void> => {
      for (let i = 0; i < count; i++) {
        const rng = seededRng(opts.seed + index * 97)
        let plan: SessionPlan
        if (kind === 'replay') {
          const source = captures[0]
          if (!source) {
            console.log('no captured human session to replay; skipping')
            return
          }
          plan = { ...source, session_id: `replay-${index}` }
          const gatewaySession = await initGatewaySession(opts.gateway)
          await postTelemetry(opts.gateway, gatewaySession, plan)
        } else {
          plan = makePlan(kind, `${kind}-${index}`, rng)
          const decision = await driveSession(browser, opts.demo, plan)
          console.log(`${plan.session_id} [${plan.label}] -> ${decision.trim().replace(/\s+/g, ' ')}`)
          if (kind === 'human') captures.push(plan)
        }
        writeRawLog(opts.out, plan)
        appendPlanToCsv(csvPath, plan)
        index++
      }
    }

    await runPersona('human', opts.human)
    await runPersona('naive', opts.naive)
    await runPersona('jitter', opts.jitter)
    await runPersona('replay', opts.replay)
  } finally {
    await browser.close()
  }

  console.log(`wrote ${index} sessions to ${csvPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})