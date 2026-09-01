import { useEffect, useRef } from 'react'

interface Props {
  points: Array<{ x: number; y: number; t: number }>
}

const CANVAS_H = 200

export function MousePathCanvas({ points }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointsRef = useRef<Array<{ x: number; y: number }>>([])
  const rafRef = useRef(0)

  useEffect(() => {
    if (points.length === 0) return
    const latest = points[points.length - 1]
    pointsRef.current.push({ x: latest.x, y: latest.y })
    if (pointsRef.current.length > 200) pointsRef.current.shift()
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

      // Auto-scroll: keep latest point centered
      const latest = pts[pts.length - 1]
      const offsetX = w / 2 - latest.x
      const offsetY = CANVAS_H / 2 - latest.y

      ctx.save()
      ctx.translate(offsetX, offsetY)

      // Draw path
      ctx.lineWidth = 1.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      for (let i = 1; i < pts.length; i++) {
        const alpha = 0.1 + (i / pts.length) * 0.7
        ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`
        ctx.beginPath()
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y)
        ctx.lineTo(pts[i].x, pts[i].y)
        ctx.stroke()
      }

      // Draw points
      for (let i = 0; i < pts.length; i++) {
        const alpha = 0.15 + (i / pts.length) * 0.65
        const radius = i === pts.length - 1 ? 4 : 2
        ctx.fillStyle = i === pts.length - 1 ? '#fff' : `rgba(59, 130, 246, ${alpha})`
        ctx.beginPath()
        ctx.arc(pts[i].x, pts[i].y, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Crosshair at latest
      if (pts.length > 0) {
        const p = pts[pts.length - 1]
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(p.x - 8, p.y)
        ctx.lineTo(p.x + 8, p.y)
        ctx.moveTo(p.x, p.y - 8)
        ctx.lineTo(p.x, p.y + 8)
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
