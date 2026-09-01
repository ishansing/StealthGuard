import { useEffect, useRef } from 'react'

interface Props {
  keystrokes: Array<{ key: string; holdMs: number }>
}

const MAX_BARS = 30
const BAR_WIDTH = 8
const GAP = 2
const CANVAS_H = 80

function holdToColor(holdMs: number): string {
  const t = Math.min(holdMs / 200, 1)
  const hue = t * 120
  return `hsl(${hue}, 70%, 50%)`
}

export function KeystrokeVisualizer({ keystrokes }: Props) {
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

    ctx.clearRect(0, 0, w, CANVAS_H)

    if (keystrokes.length === 0) {
      ctx.fillStyle = '#555'
      ctx.font = '12px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Start typing…', w / 2, CANVAS_H / 2 + 4)
      return
    }

    const bars = keystrokes.slice(-MAX_BARS).map((k) => ({
      holdMs: k.holdMs,
      color: holdToColor(k.holdMs),
    }))

    const totalW = bars.length * (BAR_WIDTH + GAP)
    const offsetX = Math.max(0, (w - totalW) / 2)

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i]
      const barH = Math.max(4, (bar.holdMs / 200) * (CANVAS_H - 16))
      const x = offsetX + i * (BAR_WIDTH + GAP)
      const y = CANVAS_H - 8 - barH
      ctx.fillStyle = bar.color
      ctx.beginPath()
      ctx.roundRect(x, y, BAR_WIDTH, barH, 2)
      ctx.fill()
    }
  }, [keystrokes])

  const count = keystrokes.length
  const avg = count > 0 ? Math.round(keystrokes.reduce((s, k) => s + k.holdMs, 0) / count) : 0

  return (
    <div className="keystroke-viz">
      <p className="viz-label">
        Keystroke Rhythm
        {count > 0 && (
          <span className="viz-meta">
            {' '}
            — {count} keys, avg {avg}ms
          </span>
        )}
      </p>
      <canvas
        ref={canvasRef}
        className="keystroke-canvas"
        aria-label={`Keystroke rhythm: ${count} keystrokes recorded, average hold ${avg}ms`}
      />
    </div>
  )
}
