---
name: Kinetic Ledger
colors:
  surface: '#faf8ff'
  surface-dim: '#d9d9e4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3fe'
  surface-container: '#ededf8'
  surface-container-high: '#e7e7f3'
  surface-container-highest: '#e2e1ed'
  on-surface: '#191b23'
  on-surface-variant: '#434654'
  inverse-surface: '#2e3039'
  inverse-on-surface: '#f0f0fb'
  outline: '#737686'
  outline-variant: '#c3c5d7'
  surface-tint: '#1353d8'
  primary: '#003fb1'
  on-primary: '#ffffff'
  primary-container: '#1a56db'
  on-primary-container: '#d4dcff'
  inverse-primary: '#b5c4ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#852b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#ad3b00'
  on-tertiary-container: '#ffd4c5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b5c4ff'
  on-primary-fixed: '#00174d'
  on-primary-fixed-variant: '#003dab'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#ffdbcf'
  tertiary-fixed-dim: '#ffb59a'
  on-tertiary-fixed: '#380d00'
  on-tertiary-fixed-variant: '#802a00'
  background: '#faf8ff'
  on-background: '#191b23'
  surface-variant: '#e2e1ed'
  surface-canvas: '#f8fafc'
  border-subtle: '#e2e8f0'
  success-status: '#10b981'
  pending-status: '#f59e0b'
  failed-status: '#ef4444'
  test-mode-amber: '#d97706'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar-width: 260px
  sidebar-collapsed: 64px
  container-max: 1440px
  gutter: 1.5rem
  cell-x: 16px
  cell-y: 12px
  stack-tight: 4px
  stack-md: 16px
---

## Brand & Style

This design system is engineered for high-stakes B2B financial operations, transitioning a mobile-first philosophy into a high-density desktop environment. The brand personality is authoritative, precise, and transparent. It adopts a **Corporate / Modern** aesthetic with an emphasis on functional clarity and information density.

The visual narrative centers on "The Ledger"—a concept where every pixel serves a purpose in the flow of capital. The interface feels robust and industrial, evoking the reliability of a tier-one clearing house while maintaining the speed of a modern SaaS application. We utilize structured grids, subtle tonal layering, and flat elevation to prioritize data over decorative elements.

## Colors

The palette is optimized for long-duration task focus and high-contrast semantic signaling.

- **Primary (Indigo):** Used for primary actions, active navigation states, and focus indicators.
- **Secondary (Slate):** Reserved for the global navigation sidebar and deep headers to create a strong mental separation between navigation and content.
- **Backgrounds:** The main canvas uses `surface-canvas` (#F8FAFC) to reduce eye strain, while cards and primary containers use pure white (#FFFFFF) for maximum contrast against data.
- **Status Tones:** High-chroma semantic colors are used strictly for transaction states (Success, Pending, Failed). These must be paired with icons or clear text labels to ensure accessibility.

## Typography

The typography system prioritizes legibility and vertical rhythm in data-heavy views.

- **Inter** is the primary typeface, providing excellent readability at the small sizes required for dashboard density.
- **JetBrains Mono** is utilized for tabular data, transaction IDs, and currency amounts. The monospaced nature ensures vertical alignment of decimal points and characters for rapid scanning.
- **Labeling:** Use `label-caps` for table headers and sidebar category titles to distinguish them from actionable data points.

## Layout & Spacing

This design system uses a **Fixed-Fluid Hybrid** layout designed for professional workstations.

- **Sidebar:** A persistent, collapsible sidebar sits on the left. It maintains a 260px width when expanded and 64px when collapsed.
- **Main Content:** A fluid area with a maximum width of 1440px to prevent excessive line lengths on ultra-wide monitors.
- **Information Density:** We utilize a tight 4px baseline grid. Data tables should maintain a compact vertical footprint with 48px standard row heights.
- **Breakpoints:**
  - **Desktop (1024px+):** Standard multi-column layout with persistent sidebar.
  - **Tablet (768px - 1023px):** Sidebar collapses to icons or hides behind a hamburger trigger; tables may introduce horizontal scrolling for overflow columns.

## Elevation & Depth

To maintain an enterprise-grade aesthetic, the design system avoids heavy shadows in favor of **Tonal Layers** and **Low-Contrast Outlines**.

- **Level 0 (Canvas):** The base background layer using `surface-canvas`.
- **Level 1 (Cards/Tables):** Pure white backgrounds with a 1px border (`border-subtle`). This creates a flat, "paper-like" depth.
- **Level 2 (Popovers/Modals):** White background with a subtle, diffused shadow (`0 10px 15px -3px rgba(0,0,0,0.1)`) and a 1px border to distinguish temporary overlays from the main content.
- **Interactive States:** Surface changes (e.g., Row Hover) use a subtle shift to a light gray tint rather than an elevation increase.

## Shapes

The design system uses **Soft** geometry to maintain a precise, professional character.

- **UI Elements:** A standard radius of 4px (`0.25rem`) is applied to buttons, input fields, and status badges.
- **Large Containers:** Cards and Modals use 8px (`0.5rem`) to provide a softer frame for dense content.
- **Pills:** Status badges and tags utilize a fully rounded (999px) radius to distinguish them from interactive buttons.

## Components

### Side Navigation
Deep slate background with active states indicated by the primary blue. Sub-items are indented with a subtle vertical line to show hierarchy.

### Data Tables
The core component of the system. Headers are sticky with a light gray background and `label-caps` text. Rows feature a subtle hover state. Monetary values are set in `data-mono` and right-aligned.

### Metric Cards
Flat white cards with 1px borders. Primary metrics use `headline-xl`. Trend indicators (up/down) use semantic success/failed colors with arrow icons.

### Search Bar (Cmd+K)
A global search input with a clear keyboard shortcut hint. Features a "Command Palette" style interface when active, utilizing a backdrop blur (8px) for the overlay.

### Input Fields
Standardized height of 36px for high density. On focus, the border shifts to primary blue with a 2px outer glow (ring).

### Status Badges
Small, pill-shaped markers. Use a 10% opacity background of the semantic color (Success, Pending, Failed) with 100% opacity text for clear, accessible status reporting.