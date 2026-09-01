import type { Stats } from '../api'

export function StatsCharts({ stats }: { stats: Stats | null }) {
  if (!stats) {
    return (
      <div className="stats-grid">
        <div className="stat-card">
          <span className="label">TOTAL SESSIONS</span>
          <span className="value">—</span>
        </div>
        <div className="stat-card">
          <span className="label">BOT TRAFFIC</span>
          <span className="value">—</span>
        </div>
        <div className="stat-card">
          <span className="label">HUMAN TRAFFIC</span>
          <span className="value">—</span>
        </div>
        <div className="stat-card">
          <span className="label">AVG CONFIDENCE</span>
          <span className="value">—</span>
        </div>
      </div>
    )
  }

  const totalSessions = Object.values(stats.decisions).reduce((a, b) => a + b, 0)
  const botTraffic = stats.decisions.block ?? 0
  const humanTraffic = stats.decisions.allow ?? 0
  const challengeTraffic = stats.decisions.challenge ?? 0

  return (
    <div className="stats-grid">
      <div className="stat-card">
        <span className="label">TOTAL SESSIONS</span>
        <span className="value">{totalSessions.toLocaleString()}</span>
        <div className="meta up">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            arrow_upward
          </span>
          ACTIVE
        </div>
      </div>
      <div className="stat-card">
        <span className="label">BOT TRAFFIC</span>
        <span className="value danger">{botTraffic.toLocaleString()}</span>
        <div className="meta warn">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            warning
          </span>
          {botTraffic > 0 ? 'ELEVATED RATE' : 'STABLE'}
        </div>
      </div>
      <div className="stat-card">
        <span className="label">HUMAN TRAFFIC</span>
        <span className="value success">{humanTraffic.toLocaleString()}</span>
        <div className="meta">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            check_circle
          </span>
          STABLE
        </div>
      </div>
      <div className="stat-card">
        <span className="label">AVG CONFIDENCE</span>
        <span className="value primary">
          {totalSessions > 0 ? ((humanTraffic / totalSessions) * 100).toFixed(0) + '%' : '—'}
        </span>
        <div className="meta">CHALLENGES: {challengeTraffic}</div>
      </div>
    </div>
  )
}
