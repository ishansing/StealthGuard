# Frontend Design System

> StealthGuard — three React apps (demo, admin, sandbox) sharing one design language.

---

## Architecture

```
frontend/
├── apps/
│   ├── demo/        → localhost:5173   End-user facing login page with live bot detection
│   ├── admin/       → localhost:5174   Analyst dashboard — sessions, stats, feedback
│   └── sandbox/     → localhost:10000  Interactive scoring playground
└── packages/
    └── stealthguard-sdk/   @stealthguard/sdk — browser telemetry collector
```

| Aspect | Choice |
|--------|--------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Routing | None — each app is a single-view SPA |
| State | `useState` / `useEffect` only (no Redux, no Zustand) |
| Styling | Plain CSS with custom properties, `prefers-color-scheme` dark mode |
| Charts | Hand-rolled `<div>` bars + raw `<canvas>` API (no charting library) |
| Icons | None — text and color convey meaning |
| Fonts | System fonts (`system-ui, -apple-system, sans-serif`) |
| Data fetching | Raw `fetch()` with typed API layer (admin) |

---

## Design Tokens

### Colors

Defined in each app's `index.css` via CSS custom properties. All apps share the same palette.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--bg` | `#ffffff` | `#1a1a1a` | Page background |
| `--fg` | `#1a1a1a` | `#e5e5e5` | Primary text |
| `--muted` | `#888888` | `#888888` | Secondary text, labels |
| `--border` | `#e5e5e5` | `#444444` | Table borders, dividers |
| `--surface` | `#f5f5f5` | `#262626` | Card/panel backgrounds |
| `--primary` | `#2563eb` | `#3b82f6` | Buttons, links, accents |
| `--success` | `#16a34a` | `#22c55e` | Allow, human, positive |
| `--danger` | `#b91c1c` | `#ef4444` | Block, bot, destructive |
| `--warning` | `#f59e0b` | `#fbbf24` | Challenge, caution |

### Typography

| Scale | Size | Weight | Usage |
|-------|------|--------|-------|
| h1 | `1.5rem` | `700` | Page title |
| h2 | `1.1rem` | `600` | Section headings |
| body | `1rem` | `400` | Default text |
| small | `0.85rem` | `400` | Captions, metadata |
| tiny | `0.75rem` | `400` | Axis labels, hints |

Line height: `1.5` everywhere. Font stack: `system-ui, -apple-system, sans-serif`.

### Spacing

| Token | Value | Usage |
|-------|-------|-------|
| xs | `0.25rem` | Tight gaps (heading to subtitle) |
| sm | `0.5rem` | Form field gaps, inline spacing |
| md | `1rem` | Section padding, card gaps |
| lg | `1.5rem` | Page vertical rhythm |
| xl | `2rem` | Section vertical spacing |

### Borders & Radii

| Element | Radius | Border |
|---------|--------|--------|
| Inputs | `6px` | `1px solid var(--border)` |
| Buttons | `6px` | none |
| Cards/panels | `8px` | `1px solid var(--border)` |
| Canvas/charts | `6px` | `1px solid var(--border)` |

### Layout Constants

| App | Max-width | Padding |
|-----|-----------|---------|
| Demo | `30rem` | `2rem 1rem` |
| Admin | `60rem` | `1.5rem 1rem` |
| Sandbox | `40rem` | `2rem 1rem` |

All apps center content with `margin: 0 auto`.

---

## Dark Mode

All apps use `color-scheme: light dark` on `:root`, which:
- Automatically switches browser chrome (scrollbars, form controls)
- Maps CSS custom properties to dark variants via `@media (prefers-color-scheme: dark)`
- No manual toggle — respects OS setting

Dark mode is **automatic**, not user-selectable. This is intentional: the demo must feel native to the user's OS, and the admin dashboard should match the analyst's environment.

---

## Pages & Components

### 1. Demo App (`/`)

**Purpose:** End-user facing. A fake login form that passively scores visitors in real-time.

**Page structure:**
```
<main>                           ← centered, max-width 30rem
  <h1>                           ← "StealthGuard Demo"
  <p.tagline>                    ← "Passive bot detection — no CAPTCHA…"
  <section[aria-live]>           ← live decision status
    <DecisionStatus>             ← shows decision + score + reason codes
  </section>
  <form.login>                   ← username + password + submit
    <label + input#username>
    <label + input#password>
    <button[type=submit]>
  </form>
  <AccessibleChallenge>          ← shown only on challenge decision
  <footer>                       ← "Session is monitored…"
</main>
```

**Components (inline, not extracted):**

| Component | Props | Behavior |
|-----------|-------|----------|
| `DecisionStatus` | `{ decision: Decision \| null, live: boolean }` | Renders decision text, score, reason codes. `data-testid="live-decision"` or `"submit-decision"` |
| `AccessibleChallenge` | `{ respondChallenge: (r: string) => Promise<Decision \| null> }` | Audio CAPTCHA alternative. Shows question, answer input, audio button. `role="status"` on result |

**Interaction flow:**
1. Page loads → SDK connects → "Connecting…" shown
2. SDK ready → form enabled → user types + moves mouse
3. Live decision updates in real-time (score + reasons)
4. User clicks "Sign in" → flush → final decision shown
5. If challenge → audio challenge section appears
6. Challenge answered → result shown

**Key design decisions:**
- Single-column layout, maximum readability
- Decision status uses `aria-live="polite"` for screen readers
- Challenge section uses dashed border (visual distinction from main form)
- Footer disclaimer is muted text

---

### 2. Admin Dashboard (`/`)

**Purpose:** Analyst view — monitor sessions, view stats, submit feedback.

**Page structure:**
```
<main>                           ← centered, max-width 60rem
  <h1>                           ← "StealthGuard Analyst Dashboard"
  <StatsCharts>                  ← statistics overview
    <section.stats>              ← flex row of stat blocks
      <div.stat-block>           ← total sessions count
      <div.stat-block>           ← session breakdown (allow/block/challenge)
    </section>
    <section>                    ← score histogram (div bars)
      <div.histogram>            ← 10 bars, height proportional
      <p.axis>                   ← "0" … "1" axis labels
    </section>
    <section>                    ← decision funnel
      <div.funnel-row>*          ← allow / block / challenge bars
    </section>
  </StatsCharts>
  <SessionTable>                 ← sortable session list
    <table.sessions>
      <thead>                    ← Session | Decision | Score | Events | Time
      <tbody>                    ← clickable rows, selected highlight
    </table>
  </SessionTable>
  <SessionDetail>                ← selected session detail panel
    <div.meta>                   ← session ID, page, timestamps
    <div.detail-grid>            ← side-by-side panels
      <figure>                   ← keystroke hold-time histogram (canvas)
      <figure>                   ← mouse path (canvas)
      <figure>                   ← keystroke interval chart (div bars)
    </div>
    <div.reasons>                ← reason codes list
    <div.reviewer>               ← feedback buttons (mark human / mark bot)
  </SessionDetail>
</main>
```

**Components:**

| Component | Props | Purpose |
|-----------|-------|---------|
| `StatsCharts` | `{ stats: Stats \| null }` | Overview cards + histogram + funnel |
| `SessionTable` | `{ sessions, selectedId, onSelect }` | Sortable, clickable session list |
| `SessionDetail` | `{ detail, feedbackStatus, onFeedback }` | Full session view with visualizations |

**Data flow:**
- Polls `GET /stealthguard/admin/sessions` every 5 seconds
- Polls `GET /stealthguard/admin/stats` every 5 seconds
- On row click → fetches `GET /stealthguard/admin/sessions/{id}`
- Feedback → `POST /stealthguard/admin/sessions/{id}/feedback`

**Key design decisions:**
- Auto-refreshing (5s interval) — no manual refresh button
- Table rows are clickable (cursor: pointer, hover highlight)
- Selected row gets distinct background (`#1e3a8a33`)
- Canvas charts for mouse path and keystroke visualization
- Div-bar charts for histograms (no library dependency)
- Feedback buttons: blue for "mark human", red for "mark bot"

---

### 3. Sandbox App (`/`)

**Purpose:** Interactive playground — type text, see live scoring, compare bot personas.

**Page structure:**
```
<main>                           ← centered, max-width 40rem
  <h1>                           ← "StealthGuard Sandbox"
  <p.tagline>                    ← "Type and move — see it scored live…"
  <form>                         ← text input + "Score it" button
    <label + input#live-text>
    <button[data-testid=score-it]>
  </form>
  <div.rhythm>                   ← score visualization bar
    <span.rhythm-marker>         ← animated position indicator
    <span.rhythm-label.left>     ← "bot"
    <span.rhythm-label.right>    ← "human"
  </div>
  <p.decision>                   ← decision text + score
  <ul.reasons>                   ← reason codes
  <section[aria-label]>          ← persona comparison
    <h2>                         ← "Compare personas"
    <div.personas>               ← button row: naive bot, adaptive bot, tremor user, human-like
    <div.persona-results>        ← results per persona
  </section>
</main>
```

**Components (inline):**

| Element | Purpose |
|---------|---------|
| Rhythm bar | Gradient bar (red→yellow→green) with animated marker showing live score |
| Persona buttons | Each sends pre-built telemetry payload to gateway |
| Persona results | Shows decision + score per persona |

**Interaction flow:**
1. Type text in input → SDK captures keystrokes + mouse
2. Click "Score it" → flush → live score displayed on rhythm bar
3. Reason codes shown below decision
4. Click persona button → sends fixed telemetry → shows result
5. Compare results across personas

**Key design decisions:**
- Rhythm bar is the primary visual element — gradient from red (bot) to green (human)
- Marker animates with `transition: left 0.4s ease` for smooth feedback
- Persona comparison section uses pre-built telemetry (no user interaction needed)
- "Score it" is manual (not auto-scored) — deliberate user action

---

## Shared Patterns

### Form Layout

All forms use CSS Grid with `gap: 0.5rem`:
```css
form {
  display: grid;
  gap: 0.5rem;
}
```

Labels are plain text above inputs. No floating labels, no placeholders as labels.

### Button States

| State | Style |
|-------|-------|
| Default | `background: var(--primary)`, `color: white` |
| Disabled | `opacity: 0.5`, `cursor: not-allowed` |
| Destructive | `background: var(--danger)` (admin "mark bot" button) |

### Decision Display

Decisions are rendered as:
```
Decision: {decision} (score {humanness_score})
{reason_code} ({weight})
{reason_code} ({weight})
```

- Decision text is `text-transform: uppercase`
- Score and weights are muted color
- Reason codes are a `<ul>` with left padding

### Table Pattern (Admin)

```css
table.sessions {
  width: 100%;
  border-collapse: collapse;
}
.sessions th, .sessions td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border);
}
.sessions tbody tr { cursor: pointer; }
.sessions tbody tr:hover { background: rgba(30, 58, 138, 0.2); }
```

### Canvas Charts (Admin)

Two canvas-based visualizations:
1. **Mouse path** — raw `<canvas>` with `lineTo()` drawing the recorded path
2. **Keystroke hold-time** — `<div>` bars (not canvas) with height proportional to hold duration

Both use dark background (`#111`) with light borders, consistent with the dark mode palette.

---

## Accessibility

### Current State

| Pattern | Implementation |
|---------|----------------|
| Semantic HTML | `<main>`, `<h1>`–`<h2>`, `<form>`, `<label>`, `<footer>`, `<section>` |
| ARIA live regions | `aria-live="polite"` on decision status (demo) |
| ARIA labels | `aria-label="Verification question"` on challenge, `aria-label="Compare personas"` on sandbox |
| Form labels | All inputs have associated `<label htmlFor>` |
| Button states | `disabled` attribute + visual opacity change |
| Keyboard | All interactive elements are native HTML (keyboard accessible by default) |
| Color contrast | Text on white: `#1a1a1a` (21:1), muted `#888` (3.5:1 — meets AA for large text) |
| Screen reader | `role="status"` on challenge result, `data-testid` for automated testing |

### Gaps (not blocking, noted for future)

- No focus-visible styles (keyboard users can't see which element is focused)
- No skip-to-content link
- No `prefers-reduced-motion` media query for rhythm bar animation
- No explicit `aria-current` on selected table row
- Challenge audio button has no fallback if `speechSynthesis` is unavailable

---

## Responsive Design

All apps use a single-column layout with `max-width` + `margin: 0 auto`. No breakpoints, no media queries, no mobile-specific styles.

| App | Max-width | Behavior on small screens |
|-----|-----------|--------------------------|
| Demo | `30rem` (480px) | Fits naturally on mobile |
| Admin | `60rem` (960px) | Horizontal scroll on tables; flex-wrap on stats |
| Sandbox | `40rem` (640px) | Fits naturally on mobile |

The admin dashboard is the only app that may need horizontal scrolling on narrow screens (session table, detail grid). The `flex-wrap: wrap` on `.stats` and `.detail-grid` handles most overflow.

---

## Performance

| Concern | Approach |
|---------|----------|
| Bundle size | No UI framework (no MUI, no Ant Design). Plain CSS = 0 JS overhead |
| Re-renders | Minimal state (3-4 `useState` per app). No context providers |
| Data fetching | Polling at 5s (admin). No WebSocket overhead |
| Charts | Div bars for histograms (no canvas library). Canvas only for mouse path |
| Dark mode | CSS custom properties + media query. No JS runtime cost |
| Fonts | System fonts only. No web font loading |

---

## File Structure Reference

```
apps/demo/
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── App.tsx          ← single view: login form + decision + challenge
│   ├── App.css          ← all demo styles (86 lines)
│   ├── index.css        ← reset + CSS variables (12 lines)
│   ├── main.tsx         ← React root mount
│   └── assets/          ← hero.png, vite.svg, react.svg

apps/admin/
├── src/
│   ├── App.tsx          ← single view: stats + table + detail
│   ├── api.ts           ← typed fetch wrappers for gateway admin API
│   ├── index.css        ← reset + CSS variables + all component styles (171 lines)
│   ├── main.tsx         ← React root mount
│   └── components/
│       ├── StatsCharts.tsx       ← stat cards + histogram + funnel
│       ├── StatsCharts.test.tsx  ← vitest tests
│       ├── SessionTable.tsx      ← sortable session list
│       └── SessionDetail.tsx     ← session detail + canvas charts + feedback

apps/sandbox/
├── src/
│   ├── App.tsx          ← single view: scoring playground + personas
│   ├── App.css          ← all sandbox styles (107 lines)
│   ├── index.css        ← reset + CSS variables (12 lines)
│   ├── main.tsx         ← React root mount
│   └── App.test.tsx     ← vitest tests
```

---

## Future: If Adding Pages or Routing

When the admin dashboard grows beyond a single view (e.g., separate pages for settings, model management, audit logs), introduce routing:

1. Install `react-router-dom` in the admin app only
2. Create a `Layout` component with sidebar navigation
3. Split `App.tsx` into route components
4. Keep demo and sandbox as single-view (they don't need routing)

Do **not** add routing to demo or sandbox — they are intentionally single-purpose.

---

## Design Principles

1. **Clarity over decoration** — no gradients, shadows, or animations except the rhythm bar (which serves a functional purpose)
2. **System fonts** — zero font loading, instant render, native feel
3. **Color = meaning** — green = human/allow, red = bot/block, yellow = challenge, blue = action
4. **Plain CSS** — no build step for styles, no CSS-in-JS runtime, no utility class overhead
5. **Accessible by default** — semantic HTML + ARIA labels + form associations
6. **Dark mode automatic** — respects OS, no toggle, no state management
7. **Minimal dependencies** — no charting library, no icon library, no component library
