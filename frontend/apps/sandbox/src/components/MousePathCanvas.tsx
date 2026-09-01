import { useEffect, useRef } from 'react'

interface Props {
  points: Array<{ x: number; y: number; t: number }>
}

const CANVAS_H = 200

export function MousePathCanvas({ points }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    canvas.width = w * dpr
    canvas.height = CANVAS_H * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, w, CANVAS_H)

    if (points.length === 0) {
      ctx.fillStyle = '#555'
      ctx.font = '12px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Move your mouse…', w / 2, CANVAS_H / 2 + 4)
      return
    }

    const pad = 16
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const scaleX = (w - pad * 2) / rangeX
    const scaleY = (CANVAS_H - pad * 2) / rangeY
    const scale = Math.min(scaleX, scaleY)
    const offsetX = (w - rangeX * scale) / 2 - minX * scale
    const offsetY = (CANVAS_H - rangeY * scale) / 2 - minY * scale

    ctx.save()
    ctx.translate(offsetX, offsetY)
    ctx.scale(scale, scale)

    ctx.lineWidth = 1.5 / scale
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (let i = 1; i < points.length; i++) {
      const alpha = 0.15 + (i / points.length) * 0.7
      ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`
      ctx.beginPath()
      ctx.moveTo(points[i - 1].x, points[i - 1].y)
      ctx.lineTo(points[i].x, points[i].y)
      ctx.stroke()
    }

    for (let i = 0; i < points.length; i++) {
      const alpha = 0.2 + (i / points.length) * 0.6
      const r = i === points.length - 1 ? 4 : 2
      ctx.fillStyle = i === points.length - 1 ? '#fff' : `rgba(59, 130, 246, ${alpha})`
      ctx.beginPath()
      ctx.arc(points[i].x, points[i].y, r / scale, 0, Math.PI * 2)
      ctx.fill()
    }

    if (points.length > 0) {
      const p = points[points.length - 1]
      const ch = 8 / scale
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 1 / scale
      ctx.beginPath()
      ctx.moveTo(p.x - ch, p.y)
      ctx.lineTo(p.x + ch, p.y)
      ctx.moveTo(p.x, p.y - ch)
      ctx.lineTo(p.x, p.y + ch)
      ctx.stroke()
    }

    ctx.restore()
  }, [points])

  return (
    <div className="mouse-viz">
      <p className="viz-label">
        Mouse Path
        {points.length > 0 && <span className="viz-meta"> — {points.length} points</span>}
      </p>
      <canvas
        ref={canvasRef}
        className="mouse-canvas"
        aria-label={`Mouse path: ${points.length} points recorded`}
      />
    </div>
  )
}
