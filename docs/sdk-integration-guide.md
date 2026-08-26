# SDK Integration Guide

How a portal team would adopt the StealthGuard SDK on a login page, including
privacy configuration and the accessible fallback challenge.

## 1. Add the SDK

```bash
npm install @stealthguard/sdk
```

## 2. Initialize on page load

```ts
import { useStealthGuard } from '@stealthguard/sdk'

export function LoginPage() {
  const { decision, ready, flush, respondChallenge } = useStealthGuard({
    gatewayUrl: import.meta.env.VITE_GATEWAY_URL ?? '/gateway', // CORS-friendly base URL
    page: '/login',
    flushIntervalMs: 2000,
    privacyMode: 'raw', // or 'aggregated'
  })
  // ...
}
```

The SDK calls `POST /stealthguard/session/init`, then listens for
keyboard/pointer events and flushes telemetry every `flushIntervalMs`, on tab
hide, and on `beforeunload` (sendBeacon).

## 3. Decide at the action moment

On form submit, `await flush()` — the gateway scores the session and returns a
decision. Never trust the SDK to make the call itself: the decision comes from
the server.

```ts
const onLogin = async (e) => {
  e.preventDefault()
  const result = await flush()
  if (result?.decision === 'allow') { /* proceed */ }
  else if (result?.decision === 'block') { /* hard stop */ }
  else { /* show the accessible challenge */ }
}
```

## 4. The accessible fallback challenge

`challenge` is a temporary state, not a rejection. Show a short,
screen-reader-friendly question with an **audio alternative** — no image
grids (SPEC §5). The demo app implements one: a text question ("What is 2 +
2?"), a keyboard-operable input, an `aria-live` status region, and a
SpeechSynthesis button to hear the question. Answers are verified
**server-side**; the client never asserts correctness.

```tsx
if (decision?.decision === 'challenge') {
  const after = await respondChallenge(answer) // POST /challenge/{id}/respond
}
```

## 5. Privacy modes

- **raw** — the SDK sends coordinates and keystroke timings; the gateway
  persists them (retention-purged after 7 days) and the ML service computes
  features.
- **aggregated** — `computeFeatures()` runs in the browser and only the
  aggregate vector is sent. Raw coordinates/keys never leave the page.

Choose `aggregated` when you want data minimization as a hard property rather
than a promise (SPEC §3 feature #2). Parity tests guarantee the client and
server compute identical numbers.

## 6. Operating notes

- **Session lifecycle:** `sessionId` comes from `init()`. Persist it if you
  span page navigations, or call `init()` per page.
- **Rate/abuse:** the gateway caps arrays at 5,000 events and rejects
  PII-shaped fields; the SDK buffers at 500 per type by default.
- **Fail-safe:** if the ML service is down, the gateway answers `challenge`,
  never `allow` (ADR 0005) — so your fallback UI must handle `challenge` as a
  routine state, not an edge case.
- **Accessibility:** keep the challenge keyboard-operable, announce decisions
  with `aria-live`, and offer an audio alternative.