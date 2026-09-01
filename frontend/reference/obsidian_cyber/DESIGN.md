---
name: Obsidian Cyber
colors:
  surface: '#1A1A1A'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c4c6cf'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8d9199'
  outline-variant: '#43474e'
  surface-tint: '#adc8f3'
  primary: '#adc8f3'
  on-primary: '#133154'
  primary-container: '#7792bb'
  on-primary-container: '#092a4d'
  inverse-primary: '#456085'
  secondary: '#c6c8b8'
  on-secondary: '#2f3227'
  secondary-container: '#45483c'
  on-secondary-container: '#b5b6a7'
  tertiary: '#ebc07e'
  on-tertiary: '#432c00'
  tertiary-container: '#b18a4e'
  on-tertiary-container: '#3b2600'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d4e3ff'
  primary-fixed-dim: '#adc8f3'
  on-primary-fixed: '#001c39'
  on-primary-fixed-variant: '#2c486c'
  secondary-fixed: '#e2e4d3'
  secondary-fixed-dim: '#c6c8b8'
  on-secondary-fixed: '#1a1d13'
  on-secondary-fixed-variant: '#45483c'
  tertiary-fixed: '#ffddae'
  tertiary-fixed-dim: '#ebc07e'
  on-tertiary-fixed: '#281800'
  on-tertiary-fixed-variant: '#5f410a'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  border: '#2D2D2D'
  success-sage: '#A7A99A'
  action-blue: '#6C87AF'
  danger-red: '#EF4444'
  warning-amber: '#FBBF24'
  muted-text: '#888888'
typography:
  h1:
    fontFamily: system-ui
    fontSize: 1.5rem
    fontWeight: '700'
    lineHeight: '1.5'
    letterSpacing: -0.02em
  h2:
    fontFamily: system-ui
    fontSize: 1.1rem
    fontWeight: '600'
    lineHeight: '1.5'
    letterSpacing: 0.05em
  body:
    fontFamily: system-ui
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: '1.5'
  small:
    fontFamily: system-ui
    fontSize: 0.85rem
    fontWeight: '400'
    lineHeight: '1.5'
  tiny:
    fontFamily: system-ui
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: 0.1em
  metric-lg:
    fontFamily: system-ui
    fontSize: 3rem
    fontWeight: '700'
    lineHeight: '1.1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2rem
  gutter: 1px
---

## Brand & Style

The design system projects a high-integrity, technical atmosphere designed for analysts and security professionals. It prioritizes clarity, performance, and serious intent, evoking a "command center" emotional response.

The design style is a hybrid of **Minimalism** and **Brutalism**, characterized by:

- **Utilitarian Precision:** A boxy layout with rigid borders and strict alignment that reflects the mathematical nature of bot detection.
- **High-Contrast Depth:** Deep charcoal and true black backgrounds provide a low-strain environment for long-duration monitoring.
- **Information Density:** Large, impactful typography for key metrics contrasted against small, technical labels for metadata.
- **Architectural Layout:** Elements are treated as structural blocks within a grid, using thin lines to define space rather than shadows or depth effects.

## Colors

The palette is optimized for a **dark-primary** experience. It moves away from standard neon "cyber" colors in favor of a sophisticated, muted professional palette.

- **Primary (Action Blue):** A desaturated, medium-light blue used for primary actions, interactive states, and "Human" classifications.
- **Secondary (Sage Green):** A muted, organic green used as a success indicator and for secondary branding elements to soften the technical edge.
- **Backgrounds:** The interface uses a tiered black system: `#0D0D0D` for the base page and `#1A1A1A` for cards and surface containers.
- **Semantics:**
  - **Action/Human:** Blue (`#6C87AF`)
  - **Safe/Positive:** Sage (`#A7A99A`)
  - **Bot/Danger:** Red (`#EF4444`)
  - **Caution:** Amber (`#FBBF24`)

## Typography

This design system uses a **System Font Stack** (`system-ui, -apple-system, sans-serif`) to ensure zero latency, maximum performance, and a native OS feel.

- **Scale:** The hierarchy is driven by contrast in weight and case.
- **Labels:** Small labels and axis text use `uppercase` and increased `letter-spacing` to maintain legibility at small sizes.
- **Metrics:** For dashboard views, a `metric-lg` style is introduced for primary session scores and totals, creating a clear focal point.
- **Responsive:** Headlines are kept under `1.5rem` to ensure consistent presentation across single-column mobile and desktop views without needing fluid scaling.

## Layout & Spacing

The layout philosophy follows a **Fixed, Single-Column Grid** centered within the viewport. It avoids complex breakpoints to maintain architectural simplicity.

- **Grid Model:** All components are contained within specific `max-width` containers (30rem for Demo, 60rem for Admin, 40rem for Sandbox).
- **Rhythm:** A strictly linear vertical flow. Section gaps use `xl` (2rem) while internal card padding uses `md` (1rem).
- **The "Boxy" Style:** Layout blocks are separated by `1px` borders (`var(--border)`). Use `gap: 0` in flex/grid containers and rely on borders to create the "grid" appearance seen in technical dashboards.
- **Responsive:** On mobile, containers naturally shrink to fit the viewport width with `1rem` side margins. Tables and large charts may implement horizontal scrolling if they exceed the container width.

## Elevation & Depth

This design system rejects traditional elevation (shadows and Z-axis depth) in favor of **Tonal Layering and Bold Outlines**.

- **Surface Tiers:** Backgrounds are `#0D0D0D`. Functional surfaces (cards, panels) use `#1A1A1A`.
- **Borders:** Depth is defined by `1px solid #2D2D2D` outlines. There are no box-shadows.
- **Interaction:** Focus and selection are indicated by high-contrast border changes or subtle background shifts (`rgba(108, 135, 175, 0.2)`) rather than lifting elements off the page.
- **Visual Dividers:** Use hair-line borders to separate header, body, and footer sections within cards, mimicking the precise look of a control panel.

## Shapes

The shape language is **Soft-Geometric**. While the overall layout is "boxy" and rigid, corners are slightly softened to provide a modern, refined finish.

- **Base Radius:** Elements like inputs, buttons, and small containers use a `0.25rem` (4px-6px) radius.
- **Container Radius:** Larger cards and panels use a `0.5rem` (8px) radius.
- **Strictness:** Do not use pill shapes or large circular radii. The goal is a professional, squared-off aesthetic that feels engineered.

## Components

### Buttons

- **Primary:** Solid `action-blue`, white text, no border.
- **Secondary/Human:** Solid `success-sage`, black/dark text.
- **Destructive/Bot:** Solid `danger-red`, white text.
- **Interaction:** On hover, reduce opacity to 0.9. On click, subtle scale down (0.98).

### Inputs

- **Style:** Background `#0D0D0D`, border `1px solid var(--border)`.
- **Focus:** Border changes to `action-blue`. No glow or outer shadow.
- **Labels:** Placed strictly above the input in `tiny` uppercase typography.

### Cards & Panels

- **Container:** Background `#1A1A1A`, border `1px solid #2D2D2D`.
- **Header:** Often features a colored top-border or a subtle background tint to categorize the content (e.g., a blue header for "Active Sessions").

### Lists & Tables (Admin)

- **Table:** `border-collapse: collapse`. Rows separated by `1px` borders.
- **Hover:** Rows highlight with a `0.2` opacity tint of `action-blue`.
- **Selection:** Selected rows use a solid `1px` border of `action-blue`.

### Visualization (Sandbox/Admin)

- **Rhythm Bar:** A horizontal gradient from `danger-red` to `success-sage`.
- **Marker:** A simple white or `action-blue` vertical line that slides with a smooth `0.4s ease` transition.
- **Charts:** Hand-rolled bars using `div` elements with fixed widths and `gap: 2px` to maintain the technical, pixel-perfect look.
