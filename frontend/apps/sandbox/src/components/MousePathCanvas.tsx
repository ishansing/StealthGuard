import { useEffect, useRef } from 'react'

interface Props {
  points: Array<{ x: number; y: number; t: number }>
}

const CANVAS_H = 200

export function MousePathCanvas({ points }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointsRef = useRef<Array<{ x: number; y: number }>>([])
  const prevLenRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    if (points.length === 0) {
      pointsRef.current = []
      prevLenRef.current = 0
      return
    }
    // New data is shorter than what we had → persona switched, reset buffer
    if (points.length < prevLenRef.current) {
      pointsRef.current = points.map((p) => ({ x: p.x, y: p.y }))
    } else {
      // Incremental: append only the new points
      const slice = points.slice(prevLenRef.current)
      for (const p of slice) {
        pointsRef.current.push({ x: p.x, y: p.y })
      }
    }
    if (pointsRef.current.length > 200) {
      pointsRef.current = pointsRef.current.slice(-200)
    }
    prevLenRef.current = points.length
  }, [points])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = (): void => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      canvas.width = w * dpr
      canvas.height = CANVAS_H * dpr
      ctx.scale(dpr, dpr)

      ctx.fillStyle = '#111'
      ctx.fillRect(0, 0, w, CANVAS_H)

      const pts = pointsRef.current
      if (pts.length === 0) {
        ctx.fillStyle = '#555'
        ctx.font = '12px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('Move your mouse…', w / 2, CANVAS_H / 2 + 4)
        return
      }

      // Fit all points in canvas with padding
      const pad = 16
      const xs = pts.map((p) => p.x)
      const ys = pts.map((p) => p.y)
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

      // Draw path
      ctx.lineWidth = 1.5 / scale
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      for (let i = 1; i < pts.length; i++) {
        const alpha = 0.15 + (i / pts.length) * 0.7
        ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`
        ctx.beginPath()
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y)
        ctx.lineTo(pts[i].x, pts[i].y)
        ctx.stroke()
      }

      // Draw points
      for (let i = 0; i < pts.length; i++) {
        const alpha = 0.2 + (i / pts.length) * 0.6
        const r = i === pts.length - 1 ? 4 : 2
        ctx.fillStyle = i === pts.length - 1 ? '#fff' : `rgba(59, 130, 246, ${alpha})`
        ctx.beginPath()
        ctx.arc(pts[i].x, pts[i].y, r / scale, 0, Math.PI * 2)
        ctx.fill()
      }

      // Crosshair at latest
      if (pts.length > 0) {
        const p = pts[pts.length - 1]
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
    }

    draw()
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
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
