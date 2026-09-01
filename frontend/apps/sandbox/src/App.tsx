import { useCallback, useRef, useState, type FormEvent } from 'react'
import { useStealthGuard } from '@stealthguard/sdk'
import { KeystrokeVisualizer } from './components/KeystrokeVisualizer'
import { MousePathCanvas } from './components/MousePathCanvas'
import { ScoreBreakdown } from './components/ScoreBreakdown'
import { DecisionBadge } from './components/DecisionBadge'
import { PersonaShowdown } from './components/PersonaShowdown'
import './App.css'

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8080'

interface Telemetry {
  keystrokes: Array<{ key: string; down_time: number; up_time: number }>
  mouse_moves: Array<{ x: number; y: number; t: number }>
  clicks?: Array<{ x: number; y: number; t: number }>
}

const PERSONAS: Record<string, Telemetry> = {
  'naive bot': {
    keystrokes: Array.from({ length: 8 }, (_, i) => ({
      key: 'x',
      down_time: i * 0.14,
      up_time: i * 0.14 + 0.06,
    })),
    mouse_moves: Array.from({ length: 6 }, (_, i) => ({ x: i * 20, y: i * 12, t: i * 0.1 })),
  },
  'adaptive bot': {
    keystrokes: Array.from({ length: 8 }, (_, i) => ({
      key: 'x',
      down_time: i * (0.13 + (i % 3) * 0.01),
      up_time: i * (0.13 + (i % 3) * 0.01) + 0.07,
    })),
    mouse_moves: Array.from({ length: 6 }, (_, i) => ({
      x: i * 20 + (i % 2) * 4,
      y: i * 12 + (i % 3) * 3,
      t: i * 0.1,
    })),
  },
  'tremor user': {
    keystrokes: Array.from({ length: 8 }, (_, i) => ({
      key: 'x',
      down_time: i * (0.16 + (i % 2) * 0.05),
      up_time: i * (0.16 + (i % 2) * 0.05) + 0.09 + (i % 2) * 0.03,
    })),
    mouse_moves: Array.from({ length: 10 }, (_, i) => ({
      x: 40 + i * 15 + (i % 2 ? 5 : -4),
      y: 40 + i * 8 + (i % 3 ? 3 : -5),
      t: i * 0.09,
    })),
  },
  'human-like': {
    keystrokes: Array.from({ length: 8 }, (_, i) => ({
      key: 'x',
      down_time: i * (0.12 + (i % 4) * 0.06),
      up_time: i * (0.12 + (i % 4) * 0.06) + 0.1 + (i % 3) * 0.05,
    })),
    mouse_moves: [
      { x: 60, y: 60, t: 0.3 },
      { x: 120, y: 150, t: 0.9 },
      { x: 90, y: 200, t: 1.5 },
      { x: 180, y: 230, t: 2.1 },
      { x: 240, y: 190, t: 2.7 },
    ],
  },
}

interface PersonaResult {
  decision: string
  score: number | null
}

export default function App() {
  const keystrokeBuffer = useRef<Array<{ key: string; holdMs: number }>>([])
  const mouseBuffer = useRef<Array<{ x: number; y: number; t: number }>>([])
  const [, setTick] = useState(0)

  const onKeystroke = useCallback((e: { key: string; holdMs: number }) => {
    keystrokeBuffer.current = [...keystrokeBuffer.current.slice(-29), e]
    setTick((t) => t + 1)
  }, [])

  const onMouseMove = useCallback((e: { x: number; y: number; t: number }) => {
    mouseBuffer.current = [...mouseBuffer.current.slice(-199), e]
    setTick((t) => t + 1)
  }, [])

  const { decision, ready, flush } = useStealthGuard({
    gatewayUrl: GATEWAY_URL,
    page: '/sandbox',
    flushIntervalMs: 60000,
    onKeystroke,
    onMouseMove,
  })

  const [personaResults, setPersonaResults] = useState<Record<string, PersonaResult>>({})
  const runAllInProgress = useRef(false)

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    void flush()
  }

  const runPersona = useCallback(async (name: string): Promise<void> => {
    const payload = PERSONAS[name]
    const res = await fetch(`${GATEWAY_URL}/stealthguard/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: crypto.randomUUID(),
        page: '/sandbox',
        privacy_mode: 'raw',
        keystrokes: payload.keystrokes,
        mouse_moves: payload.mouse_moves,
        clicks: payload.clicks ?? [],
      }),
    })
    const body = (await res.json()) as { decision: string; humanness_score: number | null }
    setPersonaResults((prev) => ({
      ...prev,
      [name]: { decision: body.decision, score: body.humanness_score },
    }))
  }, [])

  const runAll = useCallback(async () => {
    if (runAllInProgress.current) return
    runAllInProgress.current = true
    for (const name of Object.keys(PERSONAS)) {
      await runPersona(name)
      await new Promise((r) => setTimeout(r, 150))
    }
    runAllInProgress.current = false
  }, [runPersona])

  const score = decision?.humanness_score ?? 0.5
  const rhythmLeft = `${Math.round(score * 100)}%`

  return (
    <main>
      <header className="sandbox-header">
        <h1>StealthGuard Sandbox</h1>
        <p className="tagline">
          Type and move — see the detection working in real-time. No integration needed.
        </p>
      </header>

      <div className="sandbox-layout">
        <div className="live-input">
          <form onSubmit={onSubmit} className="sandbox-form">
            <label htmlFor="live-text">Type anything</label>
            <input id="live-text" name="text" autoComplete="off" placeholder="Start typing…" />
            <button type="submit" disabled={!ready} data-testid="score-it">
              Score it
            </button>
          </form>

          <div className="rhythm" data-testid="rhythm-line" aria-label="Humanness score">
            <span className="rhythm-marker" style={{ left: rhythmLeft }} />
            <span className="rhythm-tick" style={{ left: '25%' }} />
            <span className="rhythm-tick" style={{ left: '50%' }} />
            <span className="rhythm-tick" style={{ left: '75%' }} />
            <span className="rhythm-label left">bot</span>
            <span className="rhythm-label center">unsure</span>
            <span className="rhythm-label right">human</span>
          </div>

          <div className="decision-panel">
            {decision ? (
              <>
                <DecisionBadge decision={decision.decision} score={decision.humanness_score} />
                <span className="decision-status" data-testid="decision">
                  {decision.decision === 'challenge' ? ' — verification needed' : ''}
                </span>
              </>
            ) : (
              <p className="decision-idle" data-testid="decision">
                {ready ? 'Type and press Score it…' : 'Connecting…'}
              </p>
            )}
          </div>
        </div>

        <div className="live-viz">
          <KeystrokeVisualizer keystrokes={keystrokeBuffer.current} />
          <MousePathCanvas points={mouseBuffer.current} />
        </div>
      </div>

      {decision && <ScoreBreakdown decision={decision} />}

      <PersonaShowdown
        personas={PERSONAS}
        results={personaResults}
        onRun={(name) => void runPersona(name)}
        onRunAll={runAll}
      />

      <footer className="sandbox-footer">
        <p>Session is monitored by StealthGuard.</p>
      </footer>
    </main>
  )
}
