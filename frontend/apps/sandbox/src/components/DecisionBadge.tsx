import type { DecisionValue } from '@stealthguard/sdk'

interface Props {
  decision: DecisionValue | string
  score?: number | null
}

const STYLES: Record<string, { bg: string; fg: string }> = {
  allow: { bg: '#16a34a', fg: '#fff' },
  block: { bg: '#b91c1c', fg: '#fff' },
  challenge: { bg: '#f59e0b', fg: '#111' },
}

export function DecisionBadge({ decision, score }: Props) {
  const s = STYLES[decision] ?? STYLES.challenge
  return (
    <span className="decision-badge" style={{ background: s.bg, color: s.fg }} role="status">
      {decision}
      {score !== null && score !== undefined && (
        <span className="badge-score">{score.toFixed(3)}</span>
      )}
    </span>
  )
}
