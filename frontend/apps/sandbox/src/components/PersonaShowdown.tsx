import { useCallback, useMemo, useRef, useEffect } from 'react'
import { Button } from '@stealthguard/ui'
import { DecisionBadge } from './DecisionBadge'

interface Telemetry {
  keystrokes: Array<{ key: string; down_time: number; up_time: number }>
  mouse_moves: Array<{ x: number; y: number; t: number }>
  clicks?: Array<{ x: number; y: number; t: number }>
}

interface PersonaMeta {
  label: string
  emoji: string
  description: string
  color: string
}

interface PersonaResult {
  decision: string
  score: number | null
}

interface Props {
  personas: Record<string, Telemetry>
  results: Record<string, PersonaResult>
  onRun: (name: string) => void
  onRunAll: () => void
}

const PERSONA_META: Record<string, PersonaMeta> = {
  'naive bot': {
    label: 'Naive Bot',
    emoji: '🤖',
    description: 'Uniform timing, straight lines',
    color: '#ef4444',
  },
  'adaptive bot': {
    label: 'Adaptive Bot',
    emoji: '🔄',
    description: 'Slightly varied, still mechanical',
    color: '#f59e0b',
  },
  'tremor user': {
    label: 'Tremor User',
    emoji: '🫨',
    description: 'Irregular but atypical patterns',
    color: '#8b5cf6',
  },
  'human-like': {
    label: 'Human',
    emoji: '🧑',
    description: 'Natural rhythm and movement',
    color: '#22c55e',
  },
}

function MiniKeystrokeCanvas({ keystrokes }: { keystrokes: Telemetry['keystrokes'] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, w, h)

    const barW = Math.max(2, (w - 4) / keystrokes.length - 1)
    const maxHold = Math.max(...keystrokes.map((k) => k.up_time - k.down_time), 0.001)

    keystrokes.forEach((k, i) => {
      const hold = k.up_time - k.down_time
      const barH = (hold / maxHold) * (h - 4)
      const t = Math.min(hold / 0.2, 1)
      ctx.fillStyle = `hsl(${t * 120}, 70%, 50%)`
      ctx.beginPath()
      ctx.roundRect(2 + i * (barW + 1), h - 2 - barH, barW, barH, 1)
      ctx.fill()
    })
  }, [keystrokes])

  return <canvas ref={canvasRef} className="mini-canvas keystroke-mini" />
}

function MiniMouseCanvas({ mouseMoves }: { mouseMoves: Telemetry['mouse_moves'] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, w, h)

    if (mouseMoves.length < 2) return

    const xs = mouseMoves.map((p) => p.x)
    const ys = mouseMoves.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const pad = 4

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)'
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    mouseMoves.forEach((p, i) => {
      const x = pad + ((p.x - minX) / rangeX) * (w - pad * 2)
      const y = pad + ((p.y - minY) / rangeY) * (h - pad * 2)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Endpoint dot
    const last = mouseMoves[mouseMoves.length - 1]
    const lx = pad + ((last.x - minX) / rangeX) * (w - pad * 2)
    const ly = pad + ((last.y - minY) / rangeY) * (h - pad * 2)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(lx, ly, 2, 0, Math.PI * 2)
    ctx.fill()
  }, [mouseMoves])

  return <canvas ref={canvasRef} className="mini-canvas mouse-mini" />
}

function ScoreBar({ score }: { score: number | null }) {
  const pct = score !== null ? Math.round(score * 100) : 50
  return (
    <div className="mini-score-bar">
      <div className="mini-score-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function PersonaShowdown({ personas, results, onRun, onRunAll }: Props) {
  const names = Object.keys(personas)
  const meta = useMemo(
    () =>
      Object.fromEntries(
        names.map((n) => [
          n,
          PERSONA_META[n] ?? { label: n, emoji: '❓', description: '', color: '#666' },
        ]),
      ),
    [names],
  )

  const handleRunAll = useCallback(() => {
    onRunAll()
  }, [onRunAll])

  return (
    <section className="persona-showdown" aria-label="Compare personas">
      <div className="showdown-header">
        <h2>Persona Showdown</h2>
        <Button type="button" variant="secondary" onClick={handleRunAll}>
          Run All
        </Button>
      </div>
      <p className="showdown-desc">How would the system treat different inputs?</p>
      <div className="persona-grid">
        {names.map((name) => {
          const m = meta[name]
          const r = results[name]
          return (
            <div
              key={name}
              className={`persona-card ${r ? 'scored' : ''}`}
              style={{ borderColor: m.color }}
              aria-label={`${m.label}: ${r ? `${r.decision}, score ${r.score?.toFixed(3) ?? '—'}` : 'not scored yet'}`}
            >
              <div className="persona-header">
                <span className="persona-emoji">{m.emoji}</span>
                <span className="persona-name">{m.label}</span>
              </div>
              <p className="persona-desc">{m.description}</p>
              <div className="persona-viz">
                <MiniKeystrokeCanvas keystrokes={personas[name].keystrokes} />
                <MiniMouseCanvas mouseMoves={personas[name].mouse_moves} />
              </div>
              {r && (
                <div className="persona-result" data-testid={`result-${name}`}>
                  <ScoreBar score={r.score} />
                  <DecisionBadge decision={r.decision} score={r.score} />
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => onRun(name)}
                data-testid={`persona-${name}`}
              >
                {r ? 'Re-run' : 'Run'}
              </Button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
