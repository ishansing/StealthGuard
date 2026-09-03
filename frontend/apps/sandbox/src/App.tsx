import { useCallback, useMemo, useRef, useState } from 'react'
import { Button, IconButton } from '@stealthguard/ui'
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
  const [mobileOpen, setMobileOpen] = useState(false)

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
  const [activePersona, setActivePersona] = useState<string | null>(null)
  const runAllInProgress = useRef(false)

  const runPersona = useCallback(async (name: string): Promise<void> => {
    setActivePersona(name)
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

  const personaVizKeystrokes = useMemo(() => {
    if (!activePersona) return null
    return PERSONAS[activePersona].keystrokes.map((k) => ({
      key: k.key,
      holdMs: Math.round((k.up_time - k.down_time) * 1000),
    }))
  }, [activePersona])

  const personaVizPoints = useMemo(() => {
    if (!activePersona) return null
    return PERSONAS[activePersona].mouse_moves
  }, [activePersona])

  const showLive = activePersona === null
  const score = decision?.humanness_score ?? 0.5
  const scorePct = Math.round(score * 100)
  const rhythmLeft = `${scorePct}%`
  const scoreColor =
    scorePct < 40 ? 'var(--danger)' : scorePct < 70 ? 'var(--warning)' : 'var(--success)'

  return (
    <div className="app-layout">
      {/* Top Nav */}
      <header className="top-nav">
        <span className="top-nav-brand">StealthGuard</span>
        <nav className="top-nav-links">
          <a className="top-nav-link" href="http://localhost:5173">
            DEMO
          </a>
          <a className="top-nav-link" href="http://localhost:5174">
            ADMIN
          </a>
          <span className="top-nav-link active">SANDBOX</span>
        </nav>

        <IconButton
          type="button"
          variant="ghost"
          icon={mobileOpen ? 'close' : 'menu'}
          label="Toggle navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          onClick={() => setMobileOpen((o) => !o)}
          className="top-nav-hamburger"
        />
      </header>

      {/* Mobile Nav */}
      {mobileOpen && (
        <nav className="mobile-menu" id="mobile-menu" aria-label="Mobile navigation">
          <a className="top-nav-link" href="http://localhost:5173">
            DEMO
          </a>
          <a className="top-nav-link" href="http://localhost:5174">
            ADMIN
          </a>
          <span className="top-nav-link active">SANDBOX</span>
        </nav>
      )}

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <section className="sandbox-header">
          <h1>StealthGuard Sandbox</h1>
          <p className="tagline">Type and move — see it scored live…</p>
        </section>

        {/* Input Section */}
        <section className="input-section">
          <div className="input-group">
            <label htmlFor="sandbox-input">Telemetry Input Canvas</label>
            <textarea
              id="sandbox-input"
              className="sandbox-textarea"
              placeholder="Begin typing to generate telemetry data..."
              rows={4}
              autoComplete="off"
            />
          </div>
          <div className="input-actions">
            <Button type="button" disabled={!ready} onClick={() => flush()} data-testid="score-it">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '1.2rem' }}
                aria-hidden="true"
              >
                analytics
              </span>
              Score it
            </Button>
          </div>
        </section>

        {/* Rhythm Bar */}
        <section className="rhythm-section">
          <div className="rhythm-header">
            <h2>Live Confidence Score</h2>
            <span className="rhythm-score" style={{ color: scoreColor }}>
              {scorePct}%
            </span>
          </div>
          <div
            className="rhythm-bar-container"
            data-testid="rhythm-line"
            aria-label="Humanness score"
          >
            <div className="rhythm-bar-track" />
            <span className="rhythm-marker" style={{ left: rhythmLeft }} />
            <div className="rhythm-ticks">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="rhythm-labels">
            <span>High Risk (Bot)</span>
            <span>Verified (Human)</span>
          </div>
        </section>

        {/* Decision Panel */}
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

        {/* Visualization */}
        <section className="viz-section">
          {activePersona && (
            <div className="viz-header">
              <span className="viz-active-persona">Viewing: {activePersona}</span>
              <Button type="button" variant="secondary" onClick={() => setActivePersona(null)}>
                ← Back to live
              </Button>
            </div>
          )}
          <KeystrokeVisualizer
            keystrokes={showLive ? keystrokeBuffer.current : (personaVizKeystrokes ?? [])}
          />
          <MousePathCanvas points={showLive ? mouseBuffer.current : (personaVizPoints ?? [])} />
        </section>

        {/* Score Breakdown */}
        {decision && <ScoreBreakdown decision={decision} />}

        {/* Persona Showdown */}
        <PersonaShowdown
          personas={PERSONAS}
          results={personaResults}
          onRun={(name) => void runPersona(name)}
          onRunAll={runAll}
        />

        {/* Results List */}
        {Object.keys(personaResults).length > 0 && (
          <div style={{ padding: '0 2rem 2rem' }}>
            <div className="results-list">
              {Object.entries(personaResults).map(([name, r]) => (
                <div key={name} className="result-item" data-testid={`list-result-${name}`}>
                  <div className="result-info">
                    <span className="result-name">{name}</span>
                    <span className="result-meta">Score: {r.score?.toFixed(3) ?? '—'}</span>
                  </div>
                  <span
                    className={`result-status ${r.decision === 'allow' ? 'pass' : r.decision === 'challenge' ? 'review' : 'fail'}`}
                  >
                    {r.decision === 'allow'
                      ? 'Pass'
                      : r.decision === 'challenge'
                        ? 'Review'
                        : 'Fail'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="sandbox-footer">
        <span className="copyright">© 2024 STEALTHGUARD CYBERNETICS // ALL RIGHTS RESERVED</span>
        <div className="links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Security Disclosure</a>
        </div>
      </footer>
    </div>
  )
}
