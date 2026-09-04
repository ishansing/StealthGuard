# Frontend Agent Guidelines

Short, direct rules for any agent (or human) working on `frontend/`. These exist
because UI drift has recurred across sessions — buttons hand-rolled per screen,
hardcoded colors, inconsistent behavior. Read this before touching the UI.

## 1. Interactive elements come from `@stealthguard/ui` — never hand-roll

- Use `Button`, `IconButton`, `LinkButton` from `frontend/packages/ui`. They are
  the only place a `<button>` or `role="button"` may appear.
- `Button` requires an explicit `type` (`"button"` or `"submit"`), owns its own
  pending/disabled guard (one click = one action even during an async call), and
  is fully keyboard-operable.
- A `<div>`/`<span>`/`<tr>` with an `onClick` is only acceptable when it is a
  genuine non-button surface (e.g. a table row) — and must then add `tabIndex`
  plus Enter/Space handling, or a focus ring on `:focus-visible`.
- The CI check `./scripts/check-shared-ui.sh` fails the lint step if a bespoke
  `<button`/`role="button"` appears outside `packages/ui`. Don't fight it.

## 2. Tokens only — never hardcoded colors or spacing

- Every color, radius, and spacing value must come from the `--*` tokens defined
  in each app's `index.css` (source: `DESIGN.md`). No ad hoc hex or px.
- Canvas drawing is the one allowed exception for colors: pass token values via
  `var(--token)` where the context is a real canvas, or read them once from a
  computed style — don't scatter raw hex.

## 3. Every interactive change ships with a test

- A change that adds or edits an interactive element must include the matching
  test in the **same** change: a `Button.test.tsx`-style unit test for shared
  components, or a Playwright/Testing-Library interaction test for app screens.

## 4. Before marking a UI task done, run the checklist

For every new or changed interactive element:

- [ ] Rendered as a real `<button>` (or `<a>` for real navigation)?
- [ ] Explicit `type` set (required by the shared component)?
- [ ] One click fires the action exactly once; double-click doesn't duplicate?
- [ ] Enter and Space both activate it while focused?
- [ ] Visible focus ring on `:focus-visible`?
- [ ] Disabled/loading state actually blocks activation?
- [ ] Colors/spacing/type pulled from tokens, nothing hardcoded?
- [ ] Covered by a test that would fail if any of the above regressed?

## 5. Evidence before action

Before changing a screen's markup or styles, run the app or its tests and record
what the "before" looks like. After the change, confirm the only difference is
the intended one.
