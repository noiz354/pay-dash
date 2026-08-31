---
name: Kinetic Enterprise
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#434654'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
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
  tertiary: '#3231c1'
  on-tertiary: '#ffffff'
  tertiary-container: '#4c4ed9'
  on-tertiary-container: '#dbdaff'
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
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
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
  container-max: 1440px
  sidebar-width: 260px
  gutter: 1.5rem
  stack-xs: 0.25rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 1.5rem
  table-cell-padding: 12px 16px
---

## Brand & Style

This design system is engineered for high-stakes B2B financial operations. The brand personality is authoritative, precise, and transparent. It adopts a **Corporate / Modern** aesthetic with a heavy emphasis on information density and functional clarity. 

The visual narrative centers on "The Ledger"—a concept where every pixel serves a purpose in the flow of capital. We utilize a structured grid, subtle tonal layering, and high-contrast navigational elements to differentiate global control from local data management. The interface should feel robust and industrial, evoking the reliability of a tier-one clearing house while maintaining the speed of a modern SaaS application.

## Colors

The palette is optimized for long-duration task focus.
- **Primary (Indigo):** Used for primary actions, active states, and brand touchpoints.
- **Surface (Dark Sidebar):** The `secondary_color_hex` is reserved for the global navigation sidebar to create a strong mental separation between "Where I am" and "What I am doing."
- **Backgrounds:** The main stage uses a mix of white (`#FFFFFF`) for cards and a very light gray (`#F8FAFC`) for the underlying canvas to reduce eye strain.
- **Status Tones:** We use high-chroma semantic colors specifically for transaction states (Success, Pending, Failed). These should always be paired with icons or clear labels to ensure accessibility.

## Typography

The typography system prioritizes legibility and vertical rhythm. 
- **Inter** is the workhorse font, used for all UI labels and headings. It provides excellent readability at small sizes.
- **JetBrains Mono** is introduced for tabular data, transaction IDs, and currency amounts. The monospaced nature ensures that numbers align perfectly in tables, allowing users to scan and compare values rapidly.
- **Hierarchy:** Use `label-caps` for table headers and sidebar category titles to distinguish them from actionable data.

## Layout & Spacing

This design system uses a **Fixed-Fluid Hybrid** layout.
- **Sidebar:** A fixed 260px width sidebar on the left.
- **Main Content:** A fluid area with a maximum width of 1440px to prevent excessive line lengths on ultra-wide monitors.
- **Grid:** A 12-column grid is used within the main content area.
- **Density:** We utilize a "tight" spacing scale (4px increments) to maximize the information visible above the fold. Data tables should maintain a compact vertical footprint (48px standard row height).
- **Responsive:** On tablet (under 1024px), the sidebar collapses into a hamburger menu. On mobile, data tables switch to a card-stack view or horizontal scroll with frozen ID columns.

## Elevation & Depth

To maintain a clean, enterprise-grade look, we avoid heavy shadows. Instead, we use **Tonal Layers** and **Low-Contrast Outlines**:
- **Level 0 (Canvas):** `#F8FAFC` background.
- **Level 1 (Cards/Tables):** White background with a 1px border of `#E2E8F0`. No shadow.
- **Level 2 (Dropdowns/Modals):** White background with a subtle, diffused shadow (`0 10px 15px -3px rgba(0,0,0,0.1)`) and a 1px border.
- **Interactive:** Hover states on rows or buttons are indicated by a subtle background shift (e.g., from White to `#F1F5F9`) rather than an elevation lift.

## Shapes

The design system uses **Soft** geometry. A standard radius of 4px (`0.25rem`) is applied to buttons, input fields, and status badges. This maintains a professional, "sharper" look that fits the fintech sector, while avoiding the harshness of 0px corners. Cards and Modals may use up to 8px (`0.5rem`) to softly contain larger sections of content.

## Components

### Side Navigation
The sidebar uses a dark theme (`#0F172A`). Nested categories should be indicated by a subtle indentation and a vertical line on the left. Active items use the primary blue as a background tint or a 3px left-border accent.

### Data Tables
- **Header:** Sticky top with `label-caps` typography and a light gray background.
- **Cells:** Use `data-mono` for numeric values. Amounts should be right-aligned.
- **Status Badges:** Small, rounded-pill shapes with low-opacity background fills (e.g., Success: 10% Green fill, 100% Green text).

### Metric Cards
Large display for primary numbers (e.g., Total Revenue). Include a "Trend Indicator" in the top right—a small badge with an arrow icon indicating percentage change (Green for up, Red for down).

### Modal Dialogs
Centered with a heavy backdrop blur (8px). Header should clearly state the action (e.g., "Refund Transaction"). Footer contains right-aligned actions with the primary button on the far right.

### Alert Banners
- **Test Mode:** A high-visibility, persistent top bar in Amber (`#D97706`) with white text, signaling that data is not live.
- **Live Mode:** The bar disappears or turns into a slim blue line at the very top of the app.

### Input Fields
Standardized height of 36px for high density. Borders turn primary blue on focus with a 2px outer glow.