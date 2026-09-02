# StealthGuard — Frontend Consistency & Predictable-Interaction Fix Plan

**Location in repo:** `frontend/FIX.md`
**Companion docs:** `DESIGN.md` (visual/interaction source of truth), `SPEC.md` (architecture, coding standards)
**Purpose:** a plan for an agent to diagnose and permanently fix visual inconsistency and unpredictable button/interactive behavior across `frontend/apps/demo` and `frontend/apps/admin` — and to stop it from recurring in future agent sessions.

This is **not** a rewrite. Fix in place, in small verifiable steps, evidence before action, and a regression test attached to every fix so it can't silently come back.

---

## 0. Ground rules

1. `DESIGN.md` is the source of truth for tokens, states, motion, and copy. `SPEC.md` is the source of truth for architecture and standards. If the code disagrees with either, the code is wrong — unless the doc itself is genuinely out of date, in which case that's flagged and fixed as its own separate change, not silently overridden.
2. No fix ships without a regression test that fails on the old code and passes on the new.
3. No new one-off component when a shared one can be extended instead.
4. Every interactive control gets checked against the audit checklist in Appendix A — during this remediation *and* for anything built afterward.

---

## 1. Why this happens (root cause taxonomy)

Use this table to tag every finding in Phase 0 — it decides which later phase actually fixes it.

| Symptom | Likely root cause | Where to look |
|---|---|---|
| Buttons that mean the same thing look different across screens | No shared `Button` component — each screen (or each agent turn) hand-rolled its own markup/styles | Grep for `<button`, inline `style=`, one-off `className` per screen |
| Same button behaves differently in different places (double network call in one spot, fine in another) | No shared async/pending handling — each call site reimplements it, inconsistently | Audit every `onClick` that triggers a fetch/mutation |
| Click sometimes does nothing | Overlapping element with a stray `z-index`/`pointer-events`, or the element was unmounted/remounted around a state change, detaching its listener | Inspect the element actually under the cursor in devtools at the moment of failure |
| Enter/Space doesn't activate it | It's a `<div>`/`<span>` with `onClick`, not a real `<button>` | Grep for `onClick` on non-button, non-link elements |
| A button unexpectedly submits a form | Missing `type="button"` on a non-submit button inside a `<form>` (browsers default to `type="submit"`) | Every `<button>` inside every `<form>` |
| Double-click fires the action twice | No disable/guard while the first click's action is pending | Any async `onClick` without a loading/disabled guard |
| Colors or spacing look slightly "off" between sessions | Hardcoded hex/px values invented ad hoc instead of DESIGN.md's `--sg-*` tokens | Grep for raw `#` hex and raw `px` outside `tokens.css` |
| A fix in one place doesn't fix the visually-identical button elsewhere | Duplicated, not shared, component logic | Confirms the fix belongs in a shared component, not a call site |
| A row's button acts on the wrong row after the list updates | Using array index as the React `key` instead of a stable ID | Any `.map()` rendering a list of interactive rows |
| A submit uses stale form data | Input mixes controlled and uncontrolled patterns across renders | Any form paired with one of the flagged buttons |

---

## 2. Phase 0 — Freeze & Inventory (diagnose before touching anything) **[MVP]**

**Objective:** a complete, evidence-based map of every interactive element and its actual behavior, before any fix is written.

**Tasks**
1. **Grep inventory:** enumerate every `<button`, `role="button"`, `onClick=`, and `<a href="#">`-as-action across `frontend/apps/*` and `frontend/packages/*`. Record file, line, label/purpose, markup type, and styling method (className / inline style / styled-component) in `docs/audit/interactive-elements.md`.
2. **Screenshot baseline:** for every distinct screen/state (login, challenge, dashboard sessions list, session detail, decision banner in each of allow/challenge/block), screenshot at desktop and mobile widths into `docs/audit/screenshots/`. This is the "before," used later to catch unintended side effects of a fix.
3. **Behavioral pass:** for every entry from step 1, test — single click, rapid double-click, Enter key, Space key, click while an async action is pending, click while disabled. Log actual vs. expected in the same audit file.
4. **Token-violation pass:** grep for raw hex colors and raw pixel values outside the tokens file; log every offender.
5. **Tag every finding** against §1's taxonomy so later phases can be worked by root cause instead of by screen.

**Tests:** none yet — this phase produces evidence, not fixes.

**Docs:** `docs/audit/interactive-elements.md`, `docs/audit/screenshots/`, `docs/audit/token-violations.md`.

**Definition of Done:** every interactive element in both apps has a row with an actual-vs-expected note and a root-cause tag.

---

## 3. Phase 1 — Build the single source of truth **[MVP]**

**Objective:** one canonical, tested `Button` (and its close relatives) that every screen must use. This single change removes most of the drift at the source instead of patching each symptom separately.

**Tasks**
1. Create `frontend/packages/ui` as a real shared workspace package if it doesn't already exist.
2. Implement `<Button>`:
   - Renders a real `<button>` element — never a styled `<div>`.
   - `type: "button" | "submit"` is a **required** prop — no implicit default that can be forgotten.
   - `variant: "primary" | "secondary" | "ghost"`, mapped only to `DESIGN.md` tokens (`--sg-signal`, `--sg-slate`, etc.) — no ad hoc colors.
   - Built-in `state` handling: `default / hover / focus-visible / active / disabled / loading`.
   - `loading` automatically sets `disabled` and swaps the label for a spinner while preserving the button's rendered width, so nothing jumps.
   - The `onClick` handler is wrapped **inside the component**, not at each call site, so it no-ops while `disabled` or `loading` — this is what kills double-submits everywhere at once instead of requiring every call site to remember a guard.
3. Implement `<IconButton>` and `<LinkButton>` as thin variants sharing the same contract. `<LinkButton>` is a real `<a>` for genuine navigation — never `<button onClick={() => navigate(...)}>`, and never `<a href="#">` standing in for an action.
4. Wire the focus-visible ring exactly per `DESIGN.md` §6 (2px `--sg-signal`, 2px offset) once, inside the shared component.
5. Add a Storybook (or a minimal `/dev/components` route if Storybook is more than this repo needs) showing every variant × every state — so "what correct looks like" is checkable at a glance.

**Tests**
- `Button.test.tsx` (Vitest + Testing Library): renders as a real `<button>`; respects the required `type`; `onClick` fires exactly once per click; rapid double-click during a pending async `onClick` fires the handler only once; Enter and Space both activate it when focused; `disabled`/`loading` fully block activation (not just visual dimming); loading state doesn't change rendered width beyond a small tolerance.
- Accessibility test (Testing Library role queries, or `jest-axe`): every variant is keyboard-reachable, keyboard-operable, and has an accessible name.

**Docs:** `frontend/packages/ui/README.md` documenting the component contract (Appendix B); add a line to `DESIGN.md` §8 pointing at this implementation as the canonical one.

**Definition of Done:** `Button`/`IconButton`/`LinkButton` exist, pass the tests above, and every state renders correctly in Storybook/the dev route.

---

## 4. Phase 2 — Migrate every existing usage **[MVP]**

**Objective:** replace every bespoke button found in Phase 0 with the canonical component. No exceptions without explicit review.

**Tasks**
1. Work through `docs/audit/interactive-elements.md` row by row. Replace each bespoke button with `<Button>`/`<IconButton>`/`<LinkButton>`, preserving the exact existing copy (per `DESIGN.md` §7 — don't silently reword while migrating; wording changes are a separate, deliberate change).
2. If a screen genuinely needs a variant or behavior the shared component doesn't support yet, extend the shared component from Phase 1 — never re-fork a one-off. If it's truly a one-of-a-kind case, flag it explicitly for review before merging rather than quietly shipping a second system.
3. Delete the now-dead bespoke CSS/markup as each one is replaced — don't let two systems coexist.
4. Re-run the Phase 0 screenshot pass after each screen's migration and diff against the baseline; anything that changed outside the intended fix is a regression, not an acceptable side effect.

**Tests:** for each migrated screen, add or update a Playwright interaction test that replicates the exact behavioral check logged in the Phase 0 audit for that element — so each fixed instance has its own guard, on top of the shared component's unit tests.

**Docs:** update each row in `docs/audit/interactive-elements.md` to `status: migrated`, linked to its covering test.

**Definition of Done:** a grep for bespoke `<button`/`role="button"` outside `frontend/packages/ui` returns nothing; every audit row is checked off; no unintended visual diffs.

---

## 5. Phase 3 — Fix the underlying logic bugs **[MVP]**

For the subset of Phase 0 findings that are genuine bugs, not just "wrong component."

**Tasks**
1. **Duplicate network calls:** confirm every async handler is covered by the Phase 1 pending-guard — this should mostly be resolved by migration, but explicitly verify anything triggered outside the component (keyboard shortcuts, programmatic calls).
2. **Dead clicks:** for each "sometimes does nothing" finding, inspect what's actually under the cursor at failure (stray `z-index`/`pointer-events`), and check whether the element unmounts/remounts around a state change, detaching a ref-based listener. Fix by correcting stacking/overlay logic, not by adding a second handler as a workaround.
3. **Unexpected form submits:** audit every button inside every `<form>`; anything that isn't the intended submit action gets an explicit `type="button"`.
4. **Stale closures:** for any handler reading state inside `setTimeout`/debounce/async callbacks, switch to a functional state update or a ref so it reads current, not captured-at-render, values.
5. **List-key correctness:** any button rendered inside a `.map()` (session rows, reason codes, etc.) uses a stable ID as its React `key` — never the array index — so React doesn't misattribute DOM nodes/handlers across re-renders.
6. **Controlled/uncontrolled drift:** confirm every input paired with these buttons stays consistently controlled (value from state) or consistently uncontrolled — never switching between the two across renders.

**Tests:** one named regression test per fixed bug (e.g. `session-list-button-key-stability.test.tsx`, `challenge-form-no-stale-submit.test.tsx`) so the history of what used to break stays visible in the suite itself.

**Docs:** log root cause + fix per item in the audit doc's notes column; add a "Fixed" entry per bug to `CHANGELOG.md`.

**Definition of Done:** every Phase 0 "actual ≠ expected" row is fixed, covered by a named test, and closed out.

---

## 6. Phase 4 — Guardrails so this doesn't come back **[MVP]**

This is the phase that matters most, since the underlying problem is *recurring* drift across agent sessions, not a one-time bug.

**Tasks**
1. Add lint rules that flag: `onClick` on a non-interactive element without `role="button"` plus keyboard handling; a `<button>` with no explicit `type`; raw hex/px values outside the tokens file; any hand-rolled click handler that bypasses the shared `Button`.
2. Add a CI check that fails the build if a new `<button`/`role="button"` appears anywhere outside `frontend/packages/ui` — a plain grep-based check is enough; it needs to be a hard stop, not a clever one.
3. Add a lightweight visual-regression check (Playwright screenshot comparison against the Storybook/dev-route baseline) in CI, so a future edit to the shared `Button` is caught before it silently ships everywhere at once.
4. Write `frontend/AGENT_GUIDELINES.md` — short, direct rules for future agent sessions on this codebase:
   - Always reuse `frontend/packages/ui` components; never hand-roll an interactive element.
   - Never introduce a color, spacing, or type value that isn't already a `DESIGN.md` token.
   - Any change that adds or edits an interactive element must add the matching Playwright test in the *same* change.
   - Before marking a UI task done, run the Appendix A checklist against the new/changed element.
   - Link this file from the root `README.md` and from `SPEC.md` §17, so it's something an agent is pointed at, not something it has to stumble onto.
5. Add the Appendix B component contract as a checklist item in the PR template referenced by `SPEC.md` §17.

**Tests:** the shared package's CI job (lint + unit + visual) becomes a required check on every PR.

**Docs:** `frontend/AGENT_GUIDELINES.md`, updated PR template, a short `docs/audit/README.md` explaining how to re-run this whole audit if drift reappears later.

**Definition of Done:** CI actively blocks a new bespoke button; the guidelines file exists and is linked from what an agent reads first; the visual-regression check is green against the current baseline.

---

## 7. Definition of Done (per individual fix, used throughout)

- [ ] Root cause identified and tagged against §1, not just patched at the symptom
- [ ] Fixed in the shared component where possible, not at the call site
- [ ] Regression test added that fails on the old code and passes on the new
- [ ] Verified against `DESIGN.md` (tokens, states, copy) and `SPEC.md` §5/§6 (accessibility)
- [ ] Screenshot diffed against the Phase 0 baseline — no unintended changes
- [ ] Audit row closed out with a link to its covering test

---

## 8. Success criteria

- Every interactive control in both apps is one of the shared primitives in `frontend/packages/ui`.
- Every button of a given variant behaves identically everywhere: one click, one action; Enter/Space work; pending state disables it; focus ring matches `DESIGN.md` exactly.
- A fresh grep for bespoke `<button`/`role="button"` outside the shared package returns zero results.
- CI physically prevents the same class of bug from being reintroduced — this plan isn't "done" until recurrence is structurally blocked, not just currently absent.

---

## Appendix A — Per-element audit checklist

Use this in Phase 0, and for any new interactive element going forward:

- [ ] Rendered as a real `<button>` (or a real `<a>` if it's genuinely navigation)?
- [ ] Explicit `type` set if it lives inside a `<form>`?
- [ ] A single click fires the action exactly once?
- [ ] Rapid double-click does not duplicate the action?
- [ ] Enter and Space both activate it while focused?
- [ ] Visible focus ring matches `DESIGN.md` §6?
- [ ] Disabled/loading state actually blocks activation, not just visually implies it?
- [ ] Colors/spacing/type pulled from `DESIGN.md` tokens, nothing hardcoded?
- [ ] Copy matches `DESIGN.md` §7 (names the action, consistent label across the whole flow)?
- [ ] Covered by a test that would fail if any of the above regressed?

## Appendix B — The component contract

Every interactive primitive in `frontend/packages/ui` must:

1. Render a real, semantic HTML element for its role (`<button>`, `<a>`, `<input>`) — never a styled generic element with a click handler bolted on.
2. Own its own pending/disabled guard internally — callers pass an `onClick` and get exactly-once-per-interaction behavior for free.
3. Derive all visual values from `DESIGN.md` tokens — no component may define its own color, radius, or spacing constant.
4. Be fully keyboard-operable without any extra work from the screen that uses it.
5. Ship with a unit test covering click-once, keyboard activation, and disabled/loading behavior, and a Storybook/dev-route entry covering every variant × state.
