import type { Decision } from '@stealthguard/sdk'

interface Props {
  decision: Decision | null
}

export function ScoreBreakdown({ decision }: Props) {
  if (!decision || decision.reason_codes.length === 0) return null

  const codes = decision.reason_codes
  const maxWeight = Math.max(...codes.map((c) => Math.abs(c.weight)), 0.001)

  return (
    <div className="score-breakdown">
      <p className="viz-label">
        Score Breakdown
        <span className="score-number">
          {decision.humanness_score !== null ? decision.humanness_score.toFixed(3) : '—'}
        </span>
      </p>
      <div className="breakdown-bars">
        {codes.map((rc) => {
          const pct = (Math.abs(rc.weight) / maxWeight) * 100
          const isPositive = rc.weight >= 0
          return (
            <div key={rc.code} className="breakdown-row">
              <span className="breakdown-label">{rc.code}</span>
              <div className="breakdown-track">
                <div
                  className={`breakdown-bar ${isPositive ? 'human' : 'bot'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="breakdown-dir">{isPositive ? '→' : '←'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
