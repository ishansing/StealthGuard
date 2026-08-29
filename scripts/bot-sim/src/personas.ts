/**
 * Persona event-plan generators (SPEC §15 Phase 6).
 *
 * Each persona produces a deterministic `SessionPlan` of raw telemetry events
 * (§6.2 shape) with relative timestamps. The plans are both the ground-truth
 * training CSV and the script used to drive the real demo form in a browser.
 */

export interface Keystroke {
  key: string
  down_time: number
  up_time: number
}

export interface Point {
  x: number
  y: number
  t: number
}

export type Label = 'human' | 'bot'
export type Persona = 'human' | 'naive' | 'jitter'
export type AccessibilityPersona = 'screen-reader' | 'switch' | 'tremor'

export interface SessionPlan {
  session_id: string
  label: Label
  keystrokes: Keystroke[]
  mouse_moves: Point[]
  touch_moves: Point[]
  clicks: Point[]
  /** Privacy-safe modality/assistive signals (Phase 9 A5), not raw content. */
  signals?: {
    paste_events?: number
    keyless_fills?: number
    input_modality?: 'mouse' | 'keyboard' | 'touch' | 'switch'
  }
}

const USERNAME = 'alice'
const PASSWORD = 'spring2026'
const TEXT = USERNAME + PASSWORD

/** Deterministic PRNG (mulberry32) so seeded runs are reproducible. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

function fixedKeys(hold: number, inter: number): Keystroke[] {
  const keys: Keystroke[] = []
  let t = 0
  for (const key of TEXT) {
    keys.push({ key, down_time: round3(t), up_time: round3(t + hold) })
    t += hold + inter
  }
  return keys
}

function straightLine(fromX: number, fromY: number, toX: number, toY: number, steps: number, interval: number): Point[] {
  const moves: Point[] = []
  for (let i = 1; i <= steps; i++) {
    moves.push({
      x: round3(fromX + ((toX - fromX) * i) / steps),
      y: round3(fromY + ((toY - fromY) * i) / steps),
      t: round3(i * interval),
    })
  }
  return moves
}

/** Natural, varied typing + a curved, pause-y mouse path. */
export function humanPlan(sessionId: string, rng: () => number): SessionPlan {
  const keystrokes: Keystroke[] = []
  let t = 0
  for (const key of TEXT) {
    const hold = (60 + rng() * 130) / 1000
    keystrokes.push({ key, down_time: round3(t), up_time: round3(t + hold) })
    let inter = (80 + rng() * 220) / 1000
    if (rng() < 0.15) inter += 0.4 // occasional pause
    t += hold + inter
  }

  const mouse_moves: Point[] = []
  let x = 60
  let y = 60
  let mt = 0
  for (let i = 0; i < 10; i++) {
    mt += (0.15 + rng() * 0.3)
    x = clamp(x + (rng() - 0.4) * 130, 20, 520)
    y = clamp(y + (rng() - 0.5) * 110, 20, 420)
    mouse_moves.push({ x: round3(x), y: round3(y), t: round3(mt) })
  }

  return {
    session_id: sessionId,
    label: 'human',
    keystrokes,
    mouse_moves,
    touch_moves: [],
    clicks: [{ x: 300, y: 400, t: round3(mt + 0.15) }],
  }
}

/** Perfectly uniform timing + a perfectly straight mouse path. */
export function naivePlan(sessionId: string): SessionPlan {
  return {
    session_id: sessionId,
    label: 'bot',
    keystrokes: fixedKeys(0.06, 0.08),
    mouse_moves: straightLine(60, 60, 300, 180, 6, 0.1),
    touch_moves: [],
    clicks: [{ x: 300, y: 180, t: 0.7 }],
  }
}

/** Uniform base with small noise layered on top — still statistically bot-like. */
export function jitterPlan(sessionId: string, rng: () => number): SessionPlan {
  const keystrokes: Keystroke[] = []
  let t = 0
  for (const key of TEXT) {
    const hold = 0.06 + (rng() - 0.5) * 0.012
    const inter = 0.08 + (rng() - 0.5) * 0.016
    keystrokes.push({ key, down_time: round3(t), up_time: round3(t + hold) })
    t += hold + inter
  }
  const moves = straightLine(60, 60, 300, 180, 6, 0.1).map((m) => ({
    x: round3(m.x + (rng() - 0.5) * 6),
    y: round3(m.y + (rng() - 0.5) * 6),
    t: m.t,
  }))
  return {
    session_id: sessionId,
    label: 'bot',
    keystrokes,
    mouse_moves: moves,
    touch_moves: [],
    clicks: [{ x: 300, y: 180, t: 0.7 }],
  }
}

export function makePlan(persona: Persona, sessionId: string, rng: () => number): SessionPlan {
  switch (persona) {
    case 'human':
      return humanPlan(sessionId, rng)
    case 'naive':
      return naivePlan(sessionId)
    case 'jitter':
      return jitterPlan(sessionId, rng)
  }
}

/**
 * Accessibility personas (Phase 9 A5). These must never resolve to `block` —
 * enforced by ml-service's test_accessibility_personas.py.
 */

/** Screen-reader user: keyboard-only, slow natural typing with pauses. */
export function screenReaderPlan(sessionId: string, rng: () => number): SessionPlan {
  const keystrokes: Keystroke[] = []
  let t = 0
  for (const key of TEXT) {
    const hold = (80 + rng() * 120) / 1000
    keystrokes.push({ key, down_time: round3(t), up_time: round3(t + hold) })
    const inter = (300 + rng() * 500) / 1000 // long pauses to listen
    t += hold + inter
  }
  return {
    session_id: sessionId,
    label: 'human',
    keystrokes,
    mouse_moves: [],
    touch_moves: [],
    clicks: [],
    signals: { paste_events: 0, keyless_fills: 0, input_modality: 'keyboard' },
  }
}

/** Switch-device user: slow dwell movement to each target, then selection. */
export function switchPlan(sessionId: string): SessionPlan {
  const mouse_moves: Point[] = []
  const clicks: Point[] = []
  let t = 0
  for (let i = 0; i < 3; i++) {
    const tx = 120 + i * 100
    const ty = 140 + i * 40
    for (let step = 0; step < 3; step++) {
      t += 0.8 + step * 0.3
      mouse_moves.push({ x: round3((tx * (step + 1)) / 3), y: round3((ty * (step + 1)) / 3), t: round3(t) })
    }
    t += 0.5 // dwell before selection
    clicks.push({ x: tx, y: ty, t: round3(t) })
  }
  return {
    session_id: sessionId,
    label: 'human',
    keystrokes: [],
    mouse_moves,
    touch_moves: [],
    clicks,
    signals: { paste_events: 0, keyless_fills: 0, input_modality: 'switch' },
  }
}

/** Tremor-affected mouse user: natural path with elevated, genuine tremor. */
export function tremorPlan(sessionId: string, rng: () => number): SessionPlan {
  const keystrokes: Keystroke[] = []
  let t = 0
  for (const key of TEXT) {
    const hold = (70 + rng() * 140) / 1000
    keystrokes.push({ key, down_time: round3(t), up_time: round3(t + hold) })
    const inter = (100 + rng() * 250) / 1000
    t += hold + inter
  }
  const mouse_moves: Point[] = []
  let x = 60
  let y = 60
  let mt = 0
  for (let i = 0; i < 14; i++) {
    mt += 0.12 + rng() * 0.2
    x = clamp(x + (rng() - 0.45) * 80, 20, 520)
    y = clamp(y + (rng() - 0.5) * 70, 20, 420)
    const tremor = (rng() - 0.5) * 6 // visible high-frequency jitter
    mouse_moves.push({ x: round3(x + tremor), y: round3(y + tremor), t: round3(mt) })
  }
  return {
    session_id: sessionId,
    label: 'human',
    keystrokes,
    mouse_moves,
    touch_moves: [],
    clicks: [{ x: 300, y: 400, t: round3(mt + 0.2) }],
    signals: { paste_events: 0, keyless_fills: 0, input_modality: 'mouse' },
  }
}

export function makeAccessibilityPlan(
  persona: AccessibilityPersona,
  sessionId: string,
  rng: () => number,
): SessionPlan {
  switch (persona) {
    case 'screen-reader':
      return screenReaderPlan(sessionId, rng)
    case 'switch':
      return switchPlan(sessionId)
    case 'tremor':
      return tremorPlan(sessionId, rng)
  }
}