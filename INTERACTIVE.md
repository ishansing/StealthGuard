# Interactive Sandbox Redesign

> Make the sandbox page a visually compelling, live demonstration of StealthGuard's bot detection mechanism.

---

## Goal

The sandbox is the product's showroom. A visitor should **see** the detection working in real-time — not just read a score. The redesign adds three visual layers:

1. **Live telemetry canvas** — keystroke timing bars + mouse path drawn as the user types
2. **Score decomposition** — animated breakdown showing which features push toward human vs bot
3. **Persona showdown** — side-by-side visual comparison of bot vs human telemetry patterns

---

## Current State

The sandbox has:
- A text input + "Score it" button
- A gradient rhythm bar (red→yellow→green) with an animated marker
- Decision text + reason codes
- Four persona buttons that send pre-built telemetry and show text results

**What's missing:**
- No visualization of *what* the SDK captures (keystrokes, mouse moves)
- No visualization of *how* the model scores (feature breakdown)
- Persona results are plain text — no visual comparison of patterns
- No sense of "watching the system think"

---

## Plan: New Components

### 1. `KeystrokeVisualizer` — live keystroke timing bars

A horizontal bar chart that grows in real-time as the user types. Each bar represents one keystroke's hold duration (down_time → up_time). Taller bars = longer key holds. Color encodes hold time: short (red/bot) → long (green/human).

```
┌─────────────────────────────────────────┐
│  Keystroke Rhythm                       │
│  ▓▓▓░░▓▓▓▓░░▓▓░░░▓▓▓▓▓░░▓▓▓░░         │
│  ↑ each bar = one keystroke hold time   │
└─────────────────────────────────────────┘
```

**Data source:** SDK's internal keystroke buffer (accessed via a new `getKeystrokes()` method on the hook, or by subscribing to keystroke events).

**Implementation:**
- Canvas element, 320×80px
- Bars drawn on each keystroke event (not on render — use a ref + requestAnimationFrame)
- Bar width = proportional to hold duration
- Color: `hsl(hue, 70%, 50%)` where hue maps from 0 (short/red) to 120 (long/green)
- Max 30 visible bars, oldest scroll left
- Gracefully handles rapid typing (bars get narrower)

### 2. `MousePathCanvas` — live mouse trail

A canvas that draws the mouse path as it moves. Dots placed at each captured mousemove event, connected by lines. Color fades from old (dim) to new (bright). A small crosshair marks the current position.

```
┌─────────────────────────────────────────┐
│  Mouse Path                             │
│         ·····                           │
│       ··     ····                       │
│     ··          ···×                    │
│    ·               ·                    │
│   ·                                      │
└─────────────────────────────────────────┘
```

**Data source:** SDK's internal mouse buffer (new `getMouseMoves()` method or event subscription).

**Implementation:**
- Canvas element, 320×200px
- Points drawn on mousemove (throttled to ~30fps via requestAnimationFrame)
- Line segments connecting consecutive points
- Alpha gradient: oldest points fade to 0.1, newest at 0.8
- Crosshair at latest position (4px cross, white with dark outline)
- Auto-scroll: when path exceeds canvas, shift viewport to keep latest point centered
- Dark background (`#111`) matching admin canvas style

### 3. `ScoreBreakdown` — animated feature decomposition

Replace the plain text reason codes with a horizontal bar chart showing each feature's contribution. Positive bars extend right (toward human), negative bars extend left (toward bot). Bar color matches direction.

```
┌─────────────────────────────────────────┐
│  Score Breakdown          0.847         │
│                         ┌───┐           │
│  natural_keystroke_var  │███│ → human   │
│  natural_mouse_path     │████████│ → human │
│  consistent_pauses      │██│ → human    │
│  natural_event_volume   ←│███│ bot      │
│  uniform_typing         ←│█│ bot        │
└─────────────────────────────────────────┘
```

**Data source:** `decision.reason_codes` (already available from `useStealthGuard`).

**Implementation:**
- Pure div/CSS layout (no canvas needed)
- Each reason code = one row
- Bar width = `|weight| / maxWeight * 100%` (capped at 100%)
- Direction: positive weight → right (green), negative → left (red)
- Bars animate on score change (CSS transition: `width 0.3s ease`)
- Decision score shown as large number at top right
- Feature labels on left, direction arrows on right

### 4. `PersonaShowdown` — visual persona comparison

Replace the plain text persona results with a visual card grid. Each persona gets a card showing:
- Persona name + icon (emoji or text)
- Mini telemetry visualization (tiny keystroke bars + mouse path)
- Score bar (same gradient as rhythm bar, mini version)
- Decision badge (allow/block/challenge)

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 🤖 naive │ │ 🔄 adapt │ │ 🫨 tremor│ │ 🧑 human │
│ ▓▓▓▓▓▓▓▓ │ │ ▓▓▓░▓▓▓░ │ │ ▓░▓░▓░▓░ │ │ ░▓░░▓░░░ │
│ ████░░░░ │ │ ███░░░░░ │ │ ██░░░░░░ │ │ ░░░░░░░░ │
│ [===---] │ | [==----] | | [====--] | | [======] |
│  block   │ │  block   │ │ challenge│ │  allow   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**Data source:** Pre-built persona telemetry (already defined in `PERSONAS` constant) + gateway API calls.

**Implementation:**
- CSS Grid: 4 columns on desktop, 2 on mobile
- Each card: `border: 1px solid var(--border)`, `border-radius: 8px`, `padding: 1rem`
- Mini keystroke bars: 16×40px canvas per persona, pre-rendered from PERSONAS data
- Mini mouse path: 16×40px canvas per persona, pre-rendered from PERSONAS data
- Score bar: 100% width, same gradient as rhythm bar, 8px height
- Decision badge: colored pill (`allow` = green, `block` = red, `challenge` = yellow)
- Cards animate in sequence (stagger 100ms each) when "Run All" is clicked
- Individual persona buttons still work (click one card's "Run" button)

---

## Plan: Modified Components

### 5. `RhythmBar` — existing, enhance

Keep the gradient bar but add:
- Tick marks at 0.25, 0.5, 0.75 positions (subtle vertical lines)
- Labels: "bot" (left), "unsure" (center), "human" (right)
- Glow effect on marker when score changes (CSS `box-shadow` pulse)
- Smooth animation already exists (`transition: left 0.4s ease`) — keep it

### 6. `DecisionPanel` — existing, enhance

The current decision text area. Add:
- Decision badge: colored pill (same as persona cards)
- Score as large number with label
- Reason codes below as `ScoreBreakdown` component (replaces plain `<ul>`)

---

## Plan: Layout Redesign

### Current layout (single column):
```
h1 + tagline
form (input + button)
rhythm bar
decision text
reason codes
persona comparison (text)
```

### New layout (two-section):
```
┌─────────────────────────────────────────────────┐
│  h1 + tagline                                   │
├──────────────────────┬──────────────────────────┤
│  Live Input Panel    │  Live Visualization      │
│  ┌────────────────┐  │  ┌────────────────────┐  │
│  │ form (input +  │  │  │ KeystrokeVisualizer│  │
│  │ button)        │  │  │ (grows as typing)  │  │
│  └────────────────┘  │  └────────────────────┘  │
│  ┌────────────────┐  │  ┌────────────────────┐  │
│  │ RhythmBar      │  │  │ MousePathCanvas    │  │
│  │ (score meter)  │  │  │ (trail as moving)  │  │
│  └────────────────┘  │  └────────────────────┘  │
│  ┌────────────────┐  │  ┌────────────────────┐  │
│  │ DecisionPanel  │  │  │ ScoreBreakdown     │  │
│  │ (badge + score)│  │  │ (feature bars)     │  │
│  └────────────────┘  │  └────────────────────┘  │
├──────────────────────┴──────────────────────────┤
│  Persona Showdown (4-card grid)                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │ 🤖   │ │ 🔄   │ │ 🫨   │ │ 🧑   │           │
│  │ naive│ │ adapt│ │tremor│ │human │           │
│  │ bars │ │ bars │ │ bars │ │ bars │           │
│  │ score│ │ score│ │ score│ │ score│           │
│  └──────┘ └──────┘ └──────┘ └──────┘           │
│  [Run All] button                                │
└─────────────────────────────────────────────────┘
```

### CSS Grid structure:
```css
.sandbox-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  max-width: 64rem;
  margin: 0 auto;
}

.live-input { /* left column */ }
.live-viz   { /* right column */ }

@media (max-width: 768px) {
  .sandbox-layout {
    grid-template-columns: 1fr;
  }
}
```

---

## Plan: Data Flow Changes

### Current flow:
```
user types → SDK captures → user clicks "Score it" → flush() → decision shown
```

### New flow:
```
user types → SDK captures keystrokes → KeystrokeVisualizer updates live
           → SDK captures mouse moves → MousePathCanvas updates live
           → user clicks "Score it" → flush() → decision shown
                                    → ScoreBreakdown animates in
                                    → RhythmBar marker moves
```

**Key change:** Visualizations update on *capture*, not on *score*. The user sees their input being recorded before they submit it. This makes the "invisible monitoring" visible.

### SDK integration:
The SDK's `useStealthGuard` hook currently returns `{ decision, ready, flush, respondChallenge }`. To support live visualization, we need access to the raw telemetry buffers.

**Option A (minimal SDK change):** Add `onKeystroke` and `onMouseMove` callback props to `useStealthGuard`. The SDK already captures these events — we just need to expose them.

**Option B (no SDK change):** Add separate event listeners in the sandbox that mirror what the SDK does. This duplicates logic but avoids touching the SDK.

**Recommended: Option A** — add two optional callbacks to `StealthGuardOptions`:
```typescript
interface StealthGuardOptions {
  // ...existing options...
  onKeystroke?: (event: { key: string; holdMs: number }) => void
  onMouseMove?: (event: { x: number; y: number; t: number }) => void
}
```

The sandbox passes these callbacks to update canvas state. The demo and sandbox apps are unaffected (they don't pass these callbacks).

---

## Plan: Persona Data Enhancement

### Current personas:
Each persona is a static telemetry payload sent via `POST /stealthguard/telemetry`.

### Enhanced personas:
Add visual metadata to each persona for the showdown cards:

```typescript
interface PersonaMeta {
  label: string
  emoji: string
  description: string
  color: string  // accent color for the card
}

const PERSONA_META: Record<string, PersonaMeta> = {
  'naive bot':     { label: 'Naive Bot',     emoji: '🤖', description: 'Uniform timing, straight lines',     color: '#ef4444' },
  'adaptive bot':  { label: 'Adaptive Bot',  emoji: '🔄', description: 'Slightly varied, still mechanical', color: '#f59e0b' },
  'tremor user':   { label: 'Tremor User',   emoji: '🫨', description: 'Irregular but atypical patterns',   color: '#8b5cf6' },
  'human-like':    { label: 'Human',          emoji: '🧑', description: 'Natural rhythm and movement',       color: '#22c55e' },
}
```

### Mini visualizations per persona:
Pre-render each persona's keystroke + mouse data into small canvases at mount time (not on each render). Use `useMemo` to compute the bar heights and path points once.

---

## Plan: Visual Polish

### Animations:
| Element | Animation | Duration |
|---------|-----------|----------|
| Keystroke bars | Grow from bottom | 0.1s ease-out |
| Mouse path points | Fade in | 0.2s ease |
| Score breakdown bars | Width transition | 0.3s ease |
| Rhythm marker | Position slide | 0.4s ease |
| Persona cards | Stagger fade-in | 0.1s per card |
| Decision badge | Scale pop | 0.2s ease-out |

### Responsive breakpoints:
| Width | Layout |
|-------|--------|
| >768px | 2-column grid (input + viz) |
| ≤768px | Single column, viz below input |
| ≤480px | Persona cards stack vertically |

### Color coding (consistent across all visualizations):
- **Red** (`#ef4444`) = bot signals
- **Green** (`#22c55e`) = human signals
- **Yellow** (`#f59e0b`) = challenge/unsure
- **Blue** (`#3b82f6`) = neutral/info
- **Purple** (`#8b5cf6`) = accessibility/tremor

---

## Plan: File Changes

### New files:
| File | Purpose |
|------|---------|
| `apps/sandbox/src/components/KeystrokeVisualizer.tsx` | Live keystroke timing canvas |
| `apps/sandbox/src/components/MousePathCanvas.tsx` | Live mouse trail canvas |
| `apps/sandbox/src/components/ScoreBreakdown.tsx` | Feature contribution bars |
| `apps/sandbox/src/components/PersonaShowdown.tsx` | 4-card persona comparison grid |
| `apps/sandbox/src/components/DecisionBadge.tsx` | Colored pill for decision |

### Modified files:
| File | Change |
|------|--------|
| `apps/sandbox/src/App.tsx` | New layout, wire up live callbacks, import new components |
| `apps/sandbox/src/App.css` | Grid layout, new component styles, responsive rules |
| `packages/stealthguard-sdk/src/types.ts` | Add `onKeystroke?` and `onMouseMove?` to `StealthGuardOptions` |
| `packages/stealthguard-sdk/src/client.ts` | Call the optional callbacks when events are captured |
| `packages/stealthguard-sdk/src/react.ts` | Pass through the new callback options |

### Deleted files:
None. The existing rhythm bar and decision text are enhanced, not replaced.

---

## Plan: Accessibility

| Concern | Solution |
|---------|----------|
| Canvas visualizations have no text alternative | `aria-label` on each canvas describing current state (e.g., "Keystroke rhythm: 12 keystrokes recorded, average hold 85ms") |
| Persona cards are visual-only | `aria-label` on each card with full result (e.g., "Naive bot: block, score 0.12") |
| Animated content may cause vestibular issues | Respect `prefers-reduced-motion`: disable bar animations, show static final state |
| Color is the only differentiator | Add text labels (↑ human / ↓ bot) alongside color |
| Screen reader can't see live canvas updates | `role="status"` on a hidden span that announces score changes |

---

## Plan: Testing

| Test | Type | What it verifies |
|------|------|------------------|
| Keystroke bars render | Unit | Canvas draws bars for given keystroke data |
| Mouse path renders | Unit | Canvas draws path for given mouse data |
| Score breakdown bars | Unit | Correct width/direction for positive/negative weights |
| Persona cards render | Unit | All 4 personas shown with correct metadata |
| Live visualization updates | E2E | Type in sandbox → keystroke bars appear → click score → breakdown shows |
| Responsive layout | E2E | Resize to mobile → single column → all elements visible |
| Reduced motion | Unit | `prefers-reduced-motion` → no animations |

---

## Implementation Order

1. **SDK change** — add `onKeystroke`/`onMouseMove` callbacks (smallest, blocks everything else)
2. **KeystrokeVisualizer** — simplest canvas, proves the callback pattern works
3. **MousePathCanvas** — second canvas, same pattern
4. **ScoreBreakdown** — pure CSS, no canvas, independent of SDK changes
5. **DecisionBadge** — tiny component, used by ScoreBreakdown and PersonaShowdown
6. **PersonaShowdown** — combines everything, adds pre-rendered mini visualizations
7. **Layout redesign** — restructure App.tsx into grid, wire all components together
8. **Responsive + accessibility pass** — media queries, aria labels, reduced motion
9. **Polish** — animations, glow effects, stagger timing
10. **Tests** — unit tests for components, e2e for full flow

---

## Success Criteria

- [ ] Typing in the sandbox immediately shows keystroke timing bars growing
- [ ] Moving the mouse draws a visible trail on the canvas
- [ ] Clicking "Score it" animates the score breakdown bars
- [ ] Rhythm bar marker smoothly slides to the scored position
- [ ] All 4 persona cards show mini visualizations + score + decision badge
- [ ] "Run All" button triggers all personas with staggered animation
- [ ] Layout is responsive (2-col → 1-col on mobile)
- [ ] Works with `prefers-reduced-motion: reduce`
- [ ] All existing e2e tests still pass
- [ ] No new dependencies added (pure canvas + CSS)
