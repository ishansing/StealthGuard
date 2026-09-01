import { useEffect, useRef } from 'react'

import type { SessionSummary } from '../api'

interface Props {
  sessions: SessionSummary[]
}

const CANVAS_H = 160

function DecisionBar({ sessions }: { sessions: SessionSummary[] }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    canvas.width = w * dpr
    canvas.height = CANVAS_H * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, CANVAS_H)

    const counts = { allow: 0, block: 0, challenge: 0 }
    for (const s of sessions) {
      const d = s.decision as keyof typeof counts
      if (d in counts) counts[d]++
    }

    const entries = [
      { label: 'Allow', count: counts.allow, color: '#a7a99a' },
      { label: 'Block', count: counts.block, color: '#ef4444' },
      { label: 'Challenge', count: counts.challenge, color: '#fbbf24' },
    ]
    const max = Math.max(1, ...entries.map((e) => e.count))
    const barW = Math.min(60, (w - 60) / entries.length - 12)
    const startX = (w - entries.length * (barW + 12)) / 2

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      const barH = (e.count / max) * (CANVAS_H - 40)
      const x = startX + i * (barW + 12)
      const y = CANVAS_H - 24 - barH

      ctx.fillStyle = e.color
      ctx.beginPath()
      ctx.roundRect(x, y, barW, barH, 2)
      ctx.fill()

      ctx.fillStyle = '#888'
      ctx.font = '11px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(e.label, x + barW / 2, CANVAS_H - 6)

      ctx.fillStyle = '#e5e2e1'
      ctx.font = 'bold 13px system-ui'
      ctx.fillText(String(e.count), x + barW / 2, y - 6)
    }
  }, [sessions])

  return (
    <figure className="telemetry-figure">
      <figcaption>Decision Distribution</figcaption>
      <canvas ref={ref} className="telemetry-canvas" aria-label="Decision distribution bar chart" />
    </figure>
  )
}

function ScoreHistogram({ sessions }: { sessions: SessionSummary[] }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    canvas.width = w * dpr
    canvas.height = CANVAS_H * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, CANVAS_H)

    const BUCKETS = 10
    const buckets = Array.from({ length: BUCKETS }, () => 0)
    for (const s of sessions) {
      if (s.humanness_score != null) {
        const b = Math.min(Math.floor(s.humanness_score * BUCKETS), BUCKETS - 1)
        buckets[b]++
      }
    }
    const max = Math.max(1, ...buckets)
    const barW = Math.max(8, (w - 40) / BUCKETS - 2)
    const startX = (w - BUCKETS * (barW + 2)) / 2

    for (let i = 0; i < BUCKETS; i++) {
      const barH = (buckets[i] / max) * (CANVAS_H - 40)
      const x = startX + i * (barW + 2)
      const y = CANVAS_H - 24 - barH

      const t = i / BUCKETS
      const r = Math.round(239 * (1 - t) + 167 * t)
      const g = Math.round(68 * (1 - t) + 169 * t)
      const b2 = Math.round(68 * (1 - t) + 154 * t)
      ctx.fillStyle = `rgb(${r},${g},${b2})`
      ctx.beginPath()
      ctx.roundRect(x, y, barW, barH, 1)
      ctx.fill()
    }

    ctx.fillStyle = '#888'
    ctx.font = '10px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('0.0', startX, CANVAS_H - 6)
    ctx.fillText('0.5', startX + (BUCKETS / 2) * (barW + 2), CANVAS_H - 6)
    ctx.fillText('1.0', startX + BUCKETS * (barW + 2), CANVAS_H - 6)
  }, [sessions])

  return (
    <figure className="telemetry-figure">
      <figcaption>Score Distribution</figcaption>
      <canvas ref={ref} className="telemetry-canvas" aria-label="Score distribution histogram" />
    </figure>
  )
}

function PageBreakdown({ sessions }: { sessions: SessionSummary[] }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    canvas.height = CANVAS_H * dpr
    canvas.width = w * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, CANVAS_H)

    const pages: Record<string, number> = {}
    for (const s of sessions) {
      const p = s.page ?? 'unknown'
      pages[p] = (pages[p] ?? 0) + 1
    }
    const entries = Object.entries(pages).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const max = Math.max(1, ...entries.map((e) => e[1]))
    const barH = 20
    const gap = 6
    const startY = 10

    entries.forEach(([page, count], i) => {
      const y = startY + i * (barH + gap)
      const barW = (count / max) * (w - 120)

      ctx.fillStyle = '#6c87af'
      ctx.beginPath()
      ctx.roundRect(90, y, barW, barH, 2)
      ctx.fill()

      ctx.fillStyle = '#888'
      ctx.font = '11px system-ui'
      ctx.textAlign = 'right'
      ctx.fillText(page, 80, y + 14)

      ctx.fillStyle = '#e5e2e1'
      ctx.textAlign = 'left'
      ctx.fillText(String(count), 90 + barW + 6, y + 14)
    })
  }, [sessions])

  return (
    <figure className="telemetry-figure">
      <figcaption>Top Pages</figcaption>
      <canvas ref={ref} className="telemetry-canvas" aria-label="Page breakdown horizontal bar chart" />
    </figure>
  )
}

export function TelemetryCharts({ sessions }: Props) {
  if (sessions.length === 0) return null

  return (
    <section className="telemetry-grid" aria-label="Telemetry charts">
      <DecisionBar sessions={sessions} />
      <ScoreHistogram sessions={sessions} />
      <PageBreakdown sessions={sessions} />
    </section>
  )
}
