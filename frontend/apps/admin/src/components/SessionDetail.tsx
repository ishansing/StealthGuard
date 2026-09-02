import { useEffect, useRef } from 'react'
import { Button } from '@stealthguard/ui'

import type { SessionDetail, TelemetryEvent } from '../api'

function MousePathCanvas({ events }: { events: TelemetryEvent[] }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const moves = events
      .filter((e) => e.event_type === 'mouse_move' || e.event_type === 'touch_move')
      .map((e) => ({ x: e.payload.x as number, y: e.payload.y as number }))
    if (moves.length < 2) return

    const xs = moves.map((m) => m.x)
    const ys = moves.map((m) => m.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const pad = 16
    const scale = Math.min(
      (canvas.width - pad * 2) / Math.max(1, maxX - minX),
      (canvas.height - pad * 2) / Math.max(1, maxY - minY),
    )

    ctx.strokeStyle = 'var(--primary-light)'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    moves.forEach((m, i) => {
      const x = (m.x - minX) * scale + pad
      const y = (m.y - minY) * scale + pad
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    const last = moves[moves.length - 1]
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc((last.x - minX) * scale + pad, (last.y - minY) * scale + pad, 3, 0, Math.PI * 2)
    ctx.fill()
  }, [events])

  return (
    <canvas
      ref={ref}
      width={320}
      height={200}
      data-testid="mouse-path"
      aria-label="Mouse path replay"
    />
  )
}

function KeystrokeChart({ events }: { events: TelemetryEvent[] }) {
  const keys = events
    .filter((e) => e.event_type === 'keystroke')
    .map((e) => ((e.payload.up_time as number) - (e.payload.down_time as number)) * 1000)
  const maxHold = Math.max(1, ...keys)

  return (
    <div
      className="keystroke-chart"
      data-testid="keystroke-chart"
      role="img"
      aria-label="Keystroke hold times"
    >
      {keys.length === 0 && (
        <p style={{ color: 'var(--muted)', padding: '0.75rem', fontSize: '0.85rem' }}>
          No keystrokes recorded.
        </p>
      )}
      {keys.map((hold, i) => (
        <div
          key={i}
          className="key-bar"
          style={{ height: `${(hold / maxHold) * 100}%` }}
          title={`${hold.toFixed(0)} ms`}
        />
      ))}
    </div>
  )
}

export function SessionDetail({
  detail,
  feedbackStatus,
  onFeedback,
}: {
  detail: SessionDetail | null
  feedbackStatus: string | null
  onFeedback: (label: string) => void
}) {
  if (!detail) return <p className="hint">Select a session to inspect it.</p>

  const decisionColor =
    detail.decision === 'allow'
      ? 'var(--success)'
      : detail.decision === 'block'
        ? 'var(--danger)'
        : 'var(--warning)'

  return (
    <section className="detail-section" aria-label="Session detail">
      <div className="detail-header">
        <h2>Session {detail.session_id.slice(0, 8)}</h2>
        <span className="meta">Model: {detail.model_version ?? '—'}</span>
      </div>
      <div className="detail-body">
        <p style={{ marginBottom: '0.75rem' }}>
          Decision: <strong style={{ color: decisionColor }}>{detail.decision ?? '—'}</strong> ·
          Score: {detail.humanness_score?.toFixed(3) ?? '—'}
        </p>

        {detail.reason_codes.length > 0 && (
          <ul className="reasons">
            {detail.reason_codes.map((rc) => (
              <li key={rc.code}>
                {rc.code} <span>({rc.weight.toFixed(3)})</span>
              </li>
            ))}
          </ul>
        )}

        <div className="detail-grid">
          <figure>
            <figcaption>Mouse path replay</figcaption>
            <MousePathCanvas events={detail.events} />
          </figure>
          <figure>
            <figcaption>Keystroke hold times</figcaption>
            <KeystrokeChart events={detail.events} />
          </figure>
        </div>
      </div>

      <div className="reviewer">
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Reviewer feedback:</span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onFeedback('human')}
          data-testid="mark-human"
        >
          Mark as human
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onFeedback('bot')}
          data-testid="mark-bot"
        >
          Mark as bot
        </Button>
        {feedbackStatus && (
          <span role="status" data-testid="feedback-status">
            {feedbackStatus}
          </span>
        )}
      </div>
    </section>
  )
}
