import type { SessionSummary } from '../api'

export function SessionTable({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: SessionSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <section className="sessions-section" aria-label="Sessions">
      <h2>Sessions</h2>
      <div className="table-wrap">
        <table className="sessions" data-testid="session-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Decision</th>
              <th>Score</th>
              <th>Page</th>
              <th>Modality</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}
                >
                  No sessions yet.
                </td>
              </tr>
            )}
            {sessions.map((s) => (
              <tr
                key={s.session_id}
                className={s.session_id === selectedId ? 'selected' : ''}
                onClick={() => onSelect(s.session_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(s.session_id)
                  }
                }}
                tabIndex={0}
                data-testid={`session-row-${s.session_id}`}
              >
                <td>{s.session_id.slice(0, 8)}</td>
                <td>{s.decision ?? '—'}</td>
                <td>{s.humanness_score?.toFixed(3) ?? '—'}</td>
                <td>{s.page ?? '—'}</td>
                <td>{s.input_modality ?? '—'}</td>
                <td>{new Date(s.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
