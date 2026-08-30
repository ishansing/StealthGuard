import { useState, type FormEvent } from 'react'
import { useStealthGuard } from '@stealthguard/sdk'
import './App.css'

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8080'

interface Telemetry {
  keystrokes: Array<{ key: string; down_time: number; up_time: number }>
  mouse_moves: Array<{ x: number; y: number; t: number }>
  clicks?: Array<{ x: number; y: number; t: number }>
}

/** Illustrative persona telemetry for the "compare personas" section —
 *  representative shapes of the bot-simulator personas, so a visitor can see
 *  how the system would treat each without integrating anything. */
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
    mouse_moves: Array.from({ length: 6 }, (_, i) => ({ x: i * 20 + (i % 2) * 4, y: i * 12 + (i % 3) * 3, t: i * 0.1 })),
  },
  'tremor user': {
    keystrokes: Array.from({ length: 8 }, (_, i) => ({
      key: 'x',
      down_time: i * (0.16 + (i % 2) * 0.05),
      up_time: i * (0.16 + (i % 2) * 0.05) + 0.09 + (i % 2) * 0.03,
    })),
    mouse_moves: Array.from({ length: 10 }, (_, i) => ({ x: 40 + i * 15 + ((i % 2) ? 5 : -4), y: 40 + i * 8 + ((i % 3) ? 3 : -5), t: i * 0.09 })),
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
  const { decision, ready, flush } = useStealthGuard({
    gatewayUrl: GATEWAY_URL,
    page: '/sandbox',
    flushIntervalMs: 2000,
  })
  const [personaResults, setPersonaResults] = useState<Record<string, PersonaResult>>({})

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    void flush()
  }

  const runPersona = async (name: string): Promise<void> => {
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
    setPersonaResults((prev) => ({ ...prev, [name]: { decision: body.decision, score: body.humanness_score } }))
  }

  const score = decision?.humanness_score ?? 0.5
  const rhythmLeft = `${Math.round(score * 100)}%`

  return (
    <main>
      <h1>StealthGuard Sandbox</h1>
      <p className="tagline">Type and move — see it scored live. No integration needed.</p>

      <form onSubmit={onSubmit}>
        <label htmlFor="live-text">Anything</label>
        <input id="live-text" name="text" autoComplete="off" />
        <button type="submit" disabled={!ready} data-testid="score-it">
          Score it
        </button>
      </form>

      <div className="rhythm" data-testid="rhythm-line" aria-label="Humanness score">
        <span className="rhythm-marker" style={{ left: rhythmLeft }} />
        <span className="rhythm-label left">bot</span>
        <span className="rhythm-label right">human</span>
      </div>

      <p className="decision" data-testid="decision">
        {decision
          ? `Decision: ${decision.decision} (${decision.humanness_score?.toFixed(3) ?? '—'})`
          : ready
            ? 'Type and press Score it…'
            : 'Connecting…'}
      </p>
      {decision && decision.reason_codes.length > 0 && (
        <ul className="reasons">
          {decision.reason_codes.map((rc) => (
            <li key={rc.code}>
              {rc.code} <span>({rc.weight.toFixed(3)})</span>
            </li>
          ))}
        </ul>
      )}

      <section aria-label="Compare personas">
        <h2>Compare personas</h2>
        <p>How would the system treat different inputs? Try the bot-simulator shapes.</p>
        <div className="personas">
          {Object.keys(PERSONAS).map((name) => (
            <button key={name} onClick={() => void runPersona(name)} data-testid={`persona-${name}`}>
              {name}
            </button>
          ))}
        </div>
        <div className="persona-results">
          {Object.entries(personaResults).map(([name, r]) => (
            <p key={name} data-testid={`result-${name}`}>
              <b>{name}</b>: {r.decision} ({r.score === null ? '—' : r.score.toFixed(3)})
            </p>
          ))}
        </div>
      </section>
    </main>
  )
}