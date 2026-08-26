# @stealthguard/sdk

Privacy-first passive bot detection SDK. Collects keystroke and pointer
dynamics and ships them to a StealthGuard gateway — no CAPTCHA, no device
fingerprinting. See [`docs/sdk-integration-guide.md`](../../../docs/sdk-integration-guide.md).

## Install

```bash
npm install @stealthguard/sdk
```

## Quick start

```ts
import { StealthGuardClient } from '@stealthguard/sdk'

const client = new StealthGuardClient({
  gatewayUrl: 'http://localhost:8080', // your gateway
  page: '/login',
  flushIntervalMs: 2000,
})
await client.init() // creates a session + attaches listeners

// call this on form submit; the decision is returned
const decision = await client.flush()
// => { decision: 'allow' | 'block' | 'challenge', humanness_score, reason_codes, ... }

client.on((decision) => console.log('live decision', decision))
client.destroy() // when leaving the page
```

### React

```tsx
import { useStealthGuard } from '@stealthguard/sdk'

function Login() {
  const { decision, ready, flush, respondChallenge } = useStealthGuard({
    gatewayUrl: 'http://localhost:8080',
    page: '/login',
  })
  return (
    <button disabled={!ready} onClick={() => void flush()}>
      Sign in
    </button>
  )
}
```

## Privacy modes

- `privacyMode: 'raw'` (default) — sends raw coordinates and keystroke times;
  the gateway/ML service derive features server-side.
- `privacyMode: 'aggregated'` — the SDK computes the feature vector locally
  (`computeFeatures`) and transmits **only** the aggregate; raw coordinates
  and keys never leave the browser (SPEC §6.2).

`computeFeatures(raw)` is the TypeScript port of `ml-service/app/features.py`;
a cross-language parity test keeps the two numerically identical.

## Behavior

- Attaches global `keydown`/`keyup`/`mousemove`/`touchmove`/`click` listeners.
- Bounded buffers (`maxEventsPerType`, default 500) — can't grow unbounded.
- Flushes on an interval, on `visibilitychange` (hidden), and on `beforeunload`
  via `navigator.sendBeacon`.
- Calls `/stealthguard/session/init` on `init()` unless a `sessionId` is given.

## API reference

`bun run docs` generates TypeDoc output into `docs/api-reference/`.
