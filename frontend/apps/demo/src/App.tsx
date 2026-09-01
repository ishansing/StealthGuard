import { useState, type FormEvent } from 'react'
import { useStealthGuard, type Decision } from '@stealthguard/sdk'
import './App.css'

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8080'

function DecisionStatus({ decision, live }: { decision: Decision | null; live: boolean }) {
  if (!decision) {
    return (
      <div className="status-grid">
        <div className="status-cell">
          <span className="label">Decision</span>
          <span className="value" style={{ color: 'var(--muted)' }}>
            —
          </span>
        </div>
        <div className="status-cell right">
          <span className="label">Risk Score</span>
          <span className="value neutral">—</span>
        </div>
      </div>
    )
  }
  const isAllow = decision.decision === 'allow'
  const color = isAllow
    ? 'var(--success)'
    : decision.decision === 'block'
      ? 'var(--danger)'
      : 'var(--warning)'
  return (
    <div data-testid={live ? 'live-decision' : 'submit-decision'}>
      <div className="status-grid">
        <div className="status-cell">
          <span className="label">Decision</span>
          <span className="value" style={{ color }}>
            {decision.decision.toUpperCase()}
          </span>
        </div>
        <div className="status-cell right">
          <span className="label">Risk Score</span>
          <span className="value neutral">{decision.humanness_score?.toFixed(2) ?? '—'}</span>
        </div>
      </div>
      {decision.reason_codes.length > 0 && (
        <div className="reasons-section">
          <span className="label">Reason Codes</span>
          <div className="reason-tags">
            {decision.reason_codes.map((rc) => (
              <span key={rc.code} className="reason-tag">
                {rc.code}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AccessibleChallenge({
  respondChallenge,
}: {
  respondChallenge: (r: string) => Promise<Decision | null>
}) {
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<Decision | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const decision = await respondChallenge(answer)
    setResult(decision)
    setAnswer('')
  }

  const speak = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(
        'Prove you are human. What is two plus two? Type your answer and press submit.',
      )
      window.speechSynthesis.speak(utterance)
    }
  }

  return (
    <section className="challenge" aria-label="Verification question">
      <h2>Verification needed</h2>
      <p id="challenge-question">What is 2 + 2?</p>
      <form onSubmit={onSubmit}>
        <div className="form-group">
          <label htmlFor="challenge-answer">Your answer</label>
          <input
            id="challenge-answer"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" className="login-btn" style={{ flex: 1 }}>
            Submit
          </button>
          <button
            type="button"
            className="login-btn"
            onClick={speak}
            style={{ flex: 1, background: 'var(--surface-container-high)' }}
          >
            <span className="material-symbols-outlined">volume_up</span>
            Audio
          </button>
        </div>
      </form>
      {result && (
        <p
          role="status"
          style={{
            color: result.decision === 'allow' ? 'var(--success)' : 'var(--danger)',
            fontWeight: 600,
          }}
        >
          {result.decision === 'allow' ? 'Access granted. Thank you.' : `Still ${result.decision}.`}
        </p>
      )}
    </section>
  )
}

export default function App() {
  const { decision, ready, flush, respondChallenge } = useStealthGuard({
    gatewayUrl: GATEWAY_URL,
    page: '/login',
    flushIntervalMs: 60000,
  })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState<Decision | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const result = await flush()
    setSubmitted(result)
    setBusy(false)
  }

  const activeDecision = submitted ?? decision
  const statusLabel = activeDecision
    ? activeDecision.decision === 'allow'
      ? 'Verified'
      : activeDecision.decision === 'block'
        ? 'Blocked'
        : 'Reviewing'
    : 'Analyzing'
  const statusColor = activeDecision
    ? activeDecision.decision === 'allow'
      ? 'var(--success)'
      : activeDecision.decision === 'block'
        ? 'var(--danger)'
        : 'var(--warning)'
    : 'var(--success)'

  return (
    <main>
      <div className="demo-container">
        <header className="demo-header">
          <h1>StealthGuard Demo</h1>
          <p className="tagline">Passive bot detection — no CAPTCHA needed.</p>
        </header>

        <section className="status-panel" aria-live="polite" aria-atomic="true">
          <div className="status-header">
            <span className="label">Telemetry Status</span>
            <span className="status" style={{ color: statusColor }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                {activeDecision ? 'check_circle' : 'hourglass_empty'}
              </span>
              {statusLabel}
            </span>
          </div>
          <DecisionStatus decision={activeDecision} live={submitted === null} />
        </section>

        {!ready && (
          <p role="status" style={{ color: 'var(--muted)', textAlign: 'center' }}>
            Connecting…
          </p>
        )}

        <form className="login-panel" onSubmit={onSubmit}>
          <h2>Authenticate</h2>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="user@example.com"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="login-btn" disabled={busy || !ready} aria-label="Sign in">
            <span>{busy ? 'Checking…' : 'LOGIN'}</span>
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              login
            </span>
          </button>
        </form>

        {decision?.decision === 'challenge' && (
          <AccessibleChallenge respondChallenge={respondChallenge} />
        )}

        <footer className="demo-footer">
          <p>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              monitoring
            </span>
            Session is actively monitored by StealthGuard OS
          </p>
        </footer>
      </div>
    </main>
  )
}
