import { useState, type FormEvent } from 'react'
import { useStealthGuard, type Decision } from '@stealthguard/sdk'
import './App.css'

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:8080'

function DecisionStatus({ decision, live }: { decision: Decision | null; live: boolean }) {
  if (!decision) {
    return <p className="status">No decision yet — type and move the mouse, then sign in.</p>
  }
  return (
    <div className="status" data-testid={live ? 'live-decision' : 'submit-decision'}>
      <p>
        Decision: <strong>{decision.decision}</strong>
        {decision.humanness_score !== null && ` (score ${decision.humanness_score.toFixed(3)})`}
      </p>
      {decision.reason_codes.length > 0 && (
        <ul className="reasons">
          {decision.reason_codes.map((rc) => (
            <li key={rc.code}>
              {rc.code} <span className="weight">({rc.weight.toFixed(3)})</span>
            </li>
          ))}
        </ul>
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
        <label htmlFor="challenge-answer">Your answer</label>
        <input
          id="challenge-answer"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <button type="submit">Submit</button>
        <button type="button" onClick={speak}>
          Hear the question (audio)
        </button>
      </form>
      {result && (
        <p role="status">
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
    flushIntervalMs: 5000,
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

  return (
    <main>
      <h1>StealthGuard Demo</h1>
      <p className="tagline">Passive bot detection — no CAPTCHA. Just behave like yourself.</p>

      <section aria-live="polite" aria-atomic="true">
        <DecisionStatus decision={submitted ?? decision} live={submitted === null} />
      </section>

      {!ready && <p role="status">Connecting…</p>}

      <form className="login" onSubmit={onSubmit}>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <button type="submit" disabled={busy || !ready}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>

      {decision?.decision === 'challenge' && (
        <AccessibleChallenge respondChallenge={respondChallenge} />
      )}

      <footer>
        <p>Session is monitored by StealthGuard.</p>
      </footer>
    </main>
  )
}
