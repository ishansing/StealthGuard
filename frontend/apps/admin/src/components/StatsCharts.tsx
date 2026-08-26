import type { Stats } from '../api'

const BUCKETS = 10

export function StatsCharts({ stats }: { stats: Stats | null }) {
  if (!stats) return <p>Waiting for data…</p>

  const histCounts = Array.from(
    { length: BUCKETS },
    (_, b) => stats.score_histogram[String(b)] ?? 0,
  )
  const maxHist = Math.max(1, ...histCounts)

  const funnel = ['allow', 'block', 'challenge'] as const
  const maxFunnel = Math.max(1, ...funnel.map((d) => stats.decisions[d] ?? 0))

  return (
    <section className="stats" aria-label="Statistics">
      <div className="stat-block">
        <h2>Score distribution</h2>
        <div className="histogram" data-testid="histogram" role="img" aria-label="Score histogram">
          {histCounts.map((count, b) => (
            <div
              key={b}
              className="hist-bar"
              style={{ height: `${(count / maxHist) * 100}%` }}
              title={`${b / 10}–${(b + 1) / 10}: ${count}`}
              data-testid={`hist-${b}`}
            />
          ))}
        </div>
        <p className="axis">0 … … … 1 (score)</p>
      </div>

      <div className="stat-block">
        <h2>Decision funnel</h2>
        <div className="funnel" data-testid="funnel">
          {funnel.map((d) => (
            <div key={d} className="funnel-row">
              <span className="funnel-label">{d}</span>
              <div
                className="funnel-bar"
                style={{ width: `${((stats.decisions[d] ?? 0) / maxFunnel) * 100}%` }}
                data-testid={`funnel-${d}`}
              >
                {stats.decisions[d] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
