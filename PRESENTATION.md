# StealthGuard — Privacy-First Passive Bot Detection

## Complete System Walkthrough

---

## 1. The Problem

### What we're solving

Traditional bot detection relies on **CAPTCHAs** — visual puzzles that interrupt users, degrade accessibility, and are increasingly solved by AI. Meanwhile, sophisticated bots evade simple rate-limiting and fingerprinting.

**StealthGuard** takes a different approach: **passive behavioral analysis**. Instead of asking "are you human?", we observe *how* you interact — keystroke timing, mouse dynamics, touch patterns — and score humanness without ever interrupting the user.

### Why this matters

- **CAPTCHAs are broken**: AI solves them faster than humans. They add friction for real users while determined bots bypass them anyway.
- **Existing solutions are invasive**: Fingerprinting, cookie tracking, and device attestation raise privacy concerns and fail in privacy-first browsers.
- **Accessibility is ignored**: Most bot detectors penalize users with motor disabilities, tremor conditions, or switch-device input — treating legitimate accessibility needs as bot signals.

### Non-Goals (what we explicitly don't do)

- No device fingerprinting (battery, canvas, WebGL hash)
- No cookie-based tracking
- No third-party analytics injection
- No server-side session hijacking

---

## 2. How It Works — End to End

### The Journey of a Single Page Visit

```
1. User visits a page with the StealthGuard SDK
2. SDK initializes a session via POST /session/init
3. Gateway creates a session record in Postgres
4. SDK silently collects DOM events:
   - keystroke down/up times
   - mouse move coordinates + timestamps
   - touch start/move/end events
   - click positions
5. Every 60 seconds (or on page unload), SDK flushes telemetry
6. Gateway receives telemetry, orchestrates scoring:
   a. Calls ML service /features to extract behavioral features
   b. Calls ML service /score to get humanness score
   c. Applies decision policy (allow/block/challenge)
   d. Persists decision to database
7. Gateway returns decision + score + reason codes to SDK
8. SDK exposes decision to the host application
```

### What the user sees

Nothing. That's the point. The entire scoring pipeline runs in the background. The only time a user sees anything is if they're flagged as a potential bot — then they get a simple fallback challenge ("What is 2 + 2?").

---

## 3. Architecture — Four Services, One Database

### Service Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  StealthGuard SDK (npm package)                      │  │
│  │  - Collects keystroke, mouse, touch, click events    │  │
│  │  - Buffers and periodically flushes to gateway       │  │
│  │  - Exposes decision via React hook                   │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (port 8080)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Java Gateway (Spring Boot)                                │
│  - Public REST API                                         │
│  - Session management                                      │
│  - Decision policy engine                                  │
│  - Circuit breaker around ML calls                         │
│  - DB persistence                                          │
└──────┬──────────────────────────────────┬───────────────────┘
       │ HTTP (port 8000)                 │ JDBC
       ▼                                  ▼
┌──────────────────┐            ┌──────────────────┐
│  ML Service      │            │  Postgres         │
│  (Python/FastAPI)│            │  (port 5432)      │
│  - Feature       │            │  - Sessions       │
│    extraction    │            │  - Telemetry      │
│  - Scoring       │            │  - Decisions      │
│  - Model version │            │  - Challenges     │
│    management    │            │  - Feedback       │
└──────────────────┘            └──────────────────┘
```

### Why these technology choices?

| Decision | Rationale |
|----------|-----------|
| **Java gateway** | Spring Boot for production-grade REST APIs, Resilience4j for circuit breaking, JDBC for reliable DB access. Battle-tested for high-throughput API gateways. |
| **Python ML service** | FastAPI for async scoring, scikit-learn for classical ML, easy feature engineering with pandas/numpy. Python is the lingua franca of ML — no reason to fight it. |
| **Postgres** | ACID compliance for session/decision consistency. JSONB for flexible telemetry storage. Mature, well-understood, runs anywhere. |
| **React + Vite frontend** | Fast iteration, TypeScript for type safety, Vitest for testing. Three separate apps (demo, admin, sandbox) share the SDK package. |

---

## 4. The SDK — Silent Telemetry Collection

### What it collects

```typescript
// Keystroke events
{ key: 'a', down_time: 1234567890.123, up_time: 1234567890.198 }

// Mouse moves
{ x: 450, y: 320, t: 1234567890.456 }

// Touch events
{ x: 200, y: 150, t: 1234567890.789, type: 'start' }

// Clicks
{ x: 450, y: 320, t: 1234567890.123 }
```

### Why these events?

- **Keystroke timing**: Humans have variable inter-key intervals (100-300ms). Bots type with machine-like regularity (exactly 50ms between keys). Digraph timing (time between consecutive key pairs) is nearly impossible to fake.
- **Mouse dynamics**: Humans move in curves with variable speed and acceleration. Bots move in straight lines or perfectly smooth arcs. Path efficiency (how close to a straight line) is a strong signal.
- **Touch patterns**: Touch pressure, area, and duration vary between humans and scripted interactions.
- **Click positions**: Humans click within form fields. Bots click at arbitrary coordinates.

### Two modes

| Mode | How it works | Tradeoff |
|------|-------------|----------|
| **Raw** | SDK sends full event arrays to gateway. Gateway calls ML `/features` to compute feature vector. | More network traffic, but gateway controls feature computation. |
| **Aggregated** | SDK computes features client-side and sends pre-computed feature vector. | Less network traffic, but feature logic lives in the SDK (harder to update). |

**Default**: Raw mode. Feature computation stays server-side where it can be updated without redeploying the SDK.

### Why not send everything to the server?

Privacy. The SDK strips PII before sending. Keystroke *timing* is sent, but not the *keys pressed*. Mouse *coordinates* are sent, but not the *content* being clicked. The gateway never sees what the user typed — only how they typed it.

---

## 5. Feature Extraction — What Makes a Human Human

### The feature set (computed by `features.py`)

| Feature | What it measures | Why it matters |
|---------|-----------------|----------------|
| **Keystroke timing stats** | Mean, std, min, max of inter-key intervals | Humans have high variance; bots are uniform |
| **Digraph timing** | Time between specific key pairs (e.g., 'th', 'he', 'in') | Digraph patterns are personal and hard to fake |
| **Mouse speed** | Average velocity of mouse movements | Humans accelerate/decelerate; bots maintain constant speed |
| **Mouse acceleration** | Rate of speed change | Humans have natural acceleration curves |
| **Path efficiency** | How close to a straight line the mouse path is | Humans take shortcuts; bots follow precise paths |
| **Micro-tremor** | High-frequency oscillation in mouse/hold positions | Humans have natural physiological tremor (8-12 Hz) |
| **Fitts fit error** | Deviation from Fitts's Law predictions | Humans follow Fitts's Law; bots don't |
| **Direction changes** | Number of direction reversals in mouse path | Humans change direction frequently; bots rarely do |
| **Session duration** | How long the user has been on the page | Short sessions with immediate form submission are suspicious |
| **Input modality** | Keyboard, touch, switch, or mixed | Accessibility devices produce different patterns |

### Why classical ML over deep learning?

**ADR-0003** made this call deliberately:

| Factor | Classical ML (logistic regression) | Deep Learning |
|--------|-----------------------------------|---------------|
| **Explainability** | Every feature has a clear meaning. Reason codes map directly to features. | Black box. Hard to explain *why* a decision was made. |
| **Data requirements** | Works with 100s of labeled examples | Needs 10,000s+ to generalize |
| **Latency** | <10ms per scoring call | 50-200ms even on GPU |
| **Deployment** | Single pickle file, no GPU needed | Requires model serving infrastructure |
| **Retraining** | Minutes on CPU | Hours on GPU |
| **Regulatory** | Auditable, explainable decisions | Hard to audit for bias |

**Decision**: Start with logistic regression. Graduate to sequence models (LSTM/Transformer) as shadow candidates once we have enough labeled data. The architecture supports both — the scorer interface is pluggable.

---

## 6. Decision Policy — Thresholds and Tradeoffs

### The policy engine (`DecisionService`)

```
score >= 0.8  →  allow     (high confidence human)
score <= 0.4  →  block     (high confidence bot)
0.4 < score < 0.8  →  challenge  (uncertain, ask fallback question)
```

### Why these thresholds?

- **0.8 allow threshold**: Conservative. We'd rather challenge a real human than let a bot through. False positives (humans challenged) are annoying but recoverable. False negatives (bots allowed) are security failures.
- **0.4 block threshold**: Aggressive blocking creates user-hostile experiences. 0.4 catches obvious bots (uniform keystrokes, zero mouse movement) while leaving room for unusual but legitimate input patterns.
- **Challenge zone (0.4-0.8)**: The "I'm not sure" zone. Instead of guessing, we ask a simple question that any human can answer but bots struggle with.

### Per-modality overrides

Different input methods produce different behavioral signatures:

| Modality | Threshold adjustment | Reason |
|----------|---------------------|--------|
| **Keyboard** | Standard thresholds | Baseline — most data available |
| **Touch** | Slightly lower block threshold | Touch events are noisier, less granular timing |
| **Switch** | Much lower block threshold | Accessibility switch devices produce machine-like timing (single-switch scanning) |
| **Mixed** | Weighted average of modality-specific scores | User might switch between input methods |

### Fail-safe to challenge

**ADR-0005**: If the ML service is down (circuit breaker open), the gateway defaults to `challenge` — never silently allows. This means:

- Users might get challenged more often during ML outages
- But bots can never slip through during a service degradation
- Availability degrades gracefully (more challenges) rather than failing open (no detection)

---

## 7. Resilience — Circuit Breaker Pattern

### How it works (`MlServiceClient`)

The gateway wraps all ML calls in a Resilience4j circuit breaker:

```
Configuration:
  slidingWindow: 10 calls
  failureThreshold: 50% (5 of last 10 calls failed)
  waitDuration: 10 seconds (open state duration)
  retries: 2 per call, 300ms between retries
```

### State machine

```
CLOSED (normal) ──[50% failures]──> OPEN (rejecting)
       ▲                                  │
       │                           [10s timeout]
       │                                  │
       └────────── HALF-OPEN ────────────┘
                    (test call)
```

**Why this matters**: If the ML service crashes or becomes slow, the gateway doesn't wait for timeouts on every request. It immediately returns `challenge` to the user and periodically tests if the ML service has recovered. This prevents cascading failures.

---

## 8. Security & Privacy

### STRIDE analysis

| Threat | Mitigation |
|--------|-----------|
| **Spoofing** | Session IDs are UUIDs, not sequential. No auth tokens stored in localStorage. |
| **Tampering** | Telemetry is ingested once per session. No client-side decision manipulation — decisions are server-side only. |
| **Repudiation** | All decisions are logged with timestamps, scores, and reason codes. Full audit trail. |
| **Information disclosure** | PII guard strips redactable fields before logging. Keystroke *timing* is sent, not *content*. |
| **Denial of service** | Circuit breaker prevents ML service from becoming a bottleneck. Rate limiting on gateway endpoints. |
| **Elevation of privilege** | Admin endpoints require no auth in sandbox mode (demo). Production would add JWT/OAuth. |

### Privacy by design

1. **No cookies**: Sessions are identified by server-generated UUIDs, not browser cookies.
2. **No fingerprinting**: We don't collect device attributes (battery, screen resolution, GPU).
3. **No PII in telemetry**: Keystroke timing, not keystroke content. Mouse coordinates, not page content.
4. **Short retention**: Telemetry events are aggregated into feature vectors and raw events can be purged.
5. **User control**: The SDK can be configured to run in "aggregated" mode where features are computed client-side — the server never sees raw events.

---

## 9. The Admin Dashboard

### What it shows

The analyst dashboard provides visibility into the detection system:

- **Stats grid**: Total sessions, allow/block/challenge counts, average humanness score
- **Telemetry charts**: Decision distribution histogram, score distribution, top pages by session count
- **Session table**: Paginated list of all sessions with decision, score, page, modality, timestamp
- **Session detail**: Click any session to see keystroke chart, mouse path canvas, reason codes, and feedback controls

### Feedback loop

Analysts can mark sessions as `human` or `bot` — this feedback is stored and used to retrain the model. The `scripts/retrain_from_feedback.py` script:

1. Pulls all labeled sessions from the database
2. Recomputes features and retrains the model
3. Generates a shadow report comparing old vs. new model performance
4. If the new model is better, promotes it to production

---

## 10. The Bot Simulator — Training Data Generation

### Why we need it

ML models need labeled training data. Real-world data is hard to label (is this session actually a bot or a human?). The bot simulator generates **known-quality** data by driving real browsers with different personas.

### Personas

| Persona | Behavior | Purpose |
|---------|----------|---------|
| **Human** | Variable keystroke timing, natural mouse curves, realistic dwell times | Baseline "good" data |
| **Naive bot** | Uniform keystroke timing, zero mouse movement, instant form submission | Easy-to-catch bots |
| **Adaptive bot** | Adds random jitter to timing, moves mouse in approximate curves | Sophisticated bots that try to mimic humans |
| **Tremor user** | High-frequency mouse oscillation, variable key hold times | Accessibility — motor disability simulation |
| **Switch user** | Machine-like timing from single-switch scanning | Accessibility — switch device input |
| **Adversarial** | Actively tries to evade detection by varying timing distributions | Red-team testing |

### What it produces

- **Labeled CSV**: `session_id, persona, decision, score, features...` — directly usable for model training
- **Raw telemetry logs**: Full event arrays for feature extraction validation
- **E2E test coverage**: The simulator also validates that the SDK → gateway → ML pipeline works end-to-end

---

## 11. Observability

### Metrics stack

| Tool | What it monitors | Why |
|------|-----------------|-----|
| **Prometheus** | JVM metrics, HTTP latency, circuit breaker state, ML scoring latency | Time-series data for alerting and dashboards |
| **Grafana** | Dashboard visualizations of Prometheus data | Human-readable dashboards for operations |
| **Spring Actuator** | Health checks, readiness probes, JVM details | Kubernetes-compatible health endpoints |

### Key metrics tracked

- Gateway request latency (p50, p95, p99)
- ML service scoring latency
- Circuit breaker state transitions
- Decision distribution (allow/block/challenge rates)
- Session throughput (sessions/minute)
- Feature extraction time
- Database query latency

---

## 12. Testing Strategy

### Three layers

| Layer | Tool | What it tests | Speed |
|-------|------|--------------|-------|
| **Unit** | Vitest (frontend), pytest (ML) | Individual functions, components, feature extraction | <1s |
| **Integration** | Vitest + mocked APIs | SDK → gateway flow, component interactions | <5s |
| **E2E** | Playwright | Full browser → SDK → gateway → ML → decision pipeline | 10-30s |

### Cross-language parity

The `fixtures/` directory contains test vectors that both the Java gateway and Python ML service must produce identical results for. This catches serialization differences, floating-point rounding, and feature computation bugs.

### What we test

- SDK correctly collects and flushes telemetry
- Gateway creates sessions and persists decisions
- ML service extracts consistent features from raw events
- Decision policy applies correct thresholds
- Circuit breaker opens/closes at the right failure rates
- Admin dashboard renders sessions and charts
- Challenge flow works end-to-end (challenge → answer → allow)

---

## 13. Deployment

### Docker Compose (development)

```bash
make up    # Start all services
make seed  # Generate training data with bot-sim
make train # Retrain model on generated data
make test  # Run all unit + integration tests
```

### Production considerations

- **Gateway**: Horizontal scaling behind a load balancer. Stateless — all state in Postgres.
- **ML service**: Can be scaled independently. CPU-only inference (no GPU needed for logistic regression).
- **Database**: Single Postgres instance (sufficient for MVP). Would upgrade to read replicas for high throughput.
- **SDK**: Distributed via npm. Zero runtime dependencies. ~5KB gzipped.

---

## 14. Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| **Bot detection rate** | ≥90% of synthetic bots caught | Core security requirement |
| **False positive rate** | ≤5% of humans challenged | User experience — don't annoy real users |
| **Latency overhead** | <100ms per telemetry flush | Must not slow down the page |
| **SDK bundle size** | <10KB gzipped | Performance budget for frontend |
| **Accessibility** | Zero false blocks for switch/touch input | Inclusive by design |

---

## 15. Architecture Decision Records (ADRs)

| ADR | Decision | Why |
|-----|----------|-----|
| 0001 | Record architecture decisions as Markdown | Lightweight, version-controlled, reviewable |
| 0002 | Monorepo structure | Shared types, coordinated releases, single CI pipeline |
| 0003 | Classical ML over deep learning | Explainability, low data requirements, fast inference |
| 0004 | Feature computation on server | Updatable without SDK redeployment |
| 0005 | Fail-safe to challenge | Never fail open — security over availability |
| 0006 | Prometheus + Grafana for metrics | Industry standard, free, well-integrated with Spring |
| 0007 | Extended feature set with parity vectors | Cross-language consistency is critical |
| 0008 | Score calibration layer | Raw model outputs need calibration for reliable thresholds |
| 0009 | Sequence model as shadow candidate | LSTM/Transformer for future, tested in parallel |
| 0010 | Adversarial evaluation loop | Red-team testing catches threshold gaming |
| 0011 | Accessibility-aware thresholds | Switch/touch users need different thresholds |
| 0012 | Shadow trial mode | A/B test new models without affecting production decisions |

---

## 16. Live Demo Script

### For judges/audience

1. **Show the SDK integration** (`demo` app on port 5173)
   - Open browser dev tools → Network tab
   - Type in the login form → see telemetry flushing in real-time
   - Submit → see decision appear (allow/block/challenge)
   - If challenged → answer "4" → see access granted

2. **Show the admin dashboard** (`admin` app on port 5174)
   - Overview: stats grid, telemetry charts, recent sessions
   - Click a session → see keystroke chart, mouse path, reason codes
   - Mark as human/bot → feedback stored for retraining

3. **Show the sandbox** (`sandbox` app on port 5175)
   - Live typing → see score update in real-time
   - Run persona showdown → see how different bots are scored
   - Visualize keystroke timing and mouse paths

4. **Show the architecture** (terminal)
   - `docker ps` → all services running
   - `curl localhost:8080/actuator/health` → gateway healthy
   - `curl localhost:8000/health` → ML service healthy
   - `curl localhost:9090` → Prometheus collecting metrics

---

## 17. What's Next

- **Shadow mode**: Run new models in parallel without affecting decisions
- **Sequence models**: LSTM/Transformer for temporal pattern recognition
- **Adversarial hardening**: Automated red-team loop to find and patch evasion techniques
- **Accessibility expansion**: Support for screen readers, voice input, eye-tracking
- **Production auth**: JWT/OAuth for admin dashboard, API key management for SDK

---

*StealthGuard — because the best security is the kind users never notice.*
