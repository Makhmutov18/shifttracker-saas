---
name: poryadok-smeny-web-admin
version: "1.0"
description: "Dark-first operational design system for the Poryadok.Smeny web admin."
scope: web-admin
theme: dark-first
tokens:
  color:
    primary: "#2F7FFF"
    primary-hover: "#1E6FEA"
    primary-muted: "#122A48"
    background: "#0D0F12"
    surface: "#15181D"
    surface-elevated: "#1A1E24"
    surface-muted: "#111419"
    text-primary: "#F7F9FC"
    text-secondary: "#AAB2BF"
    text-muted: "#778191"
    border: "#282D35"
    border-strong: "#353C47"
    success: "#22C55E"
    warning: "#F59E0B"
    danger: "#EF4444"
    info: "#38BDF8"
  typography:
    ui-family: "Inter"
    numeric-family: "JetBrains Mono"
    body-size: "16px"
    caption-size: "13px"
    numeric-feature: "tabular-nums"
  layout:
    sidebar-width: "256px"
    content-max-width: "1600px"
    spacing-base: "8px"
    common-gap: "16px"
    panel-padding: "16px"
    panel-padding-large: "24px"
    control-height: "40px"
    touch-target-min: "44px"
  shape:
    control-radius: "8px"
    panel-radius: "16px"
    pill-radius: "9999px"
---

# Poryadok.Smeny Web Admin Design System

## Overview

This specification applies to `web-admin` only. It adapts the hierarchy and rhythm of `design-references/capital-overview-dashboard-DESIGN.md` to an operational product for venues, shifts, employees, payroll runs, payments, and audit history.

The Telegram Mini App and public landing page have separate design constraints. Do not force this desktop composition, density, or navigation model onto them.

The product should feel dark-first, calm, dense, and precise: a practical operations control center rather than a crypto exchange, gaming interface, AI dashboard, or banking terminal.

## Colors

Use the semantic color tokens in the front matter. Neutral surfaces establish hierarchy; blue is reserved for primary actions, links, focus states, and selected navigation. Success, warning, danger, and info retain their operational meanings.

Avoid pink or purple as the product language. Do not use purple-blue AI gradients, neon, strong outer glow, or decorative color fields. Light theme values remain an application concern and must preserve the same semantic roles and contrast.

## Typography

Use Inter for product UI, headings, navigation, and explanatory text. Use JetBrains Mono only for amounts, times, percentages, dates, periods, technical labels, and numeric table columns. Apply tabular numbers to numeric data. Never use monospace for menus or long body copy.

The default body size is 16px and captions are 13px or larger where space permits. Product text remains Russian and concise.

## Layout

The web admin is desktop-first with a persistent sidebar approximately 256px wide and a useful content width of about 1600px. Use a 12-column working grid when it clarifies operational relationships. Keep an 8px spacing rhythm, with common 16px gaps and panel padding of 16px or 24px.

Controls are generally 40px high. Critical narrow-screen touch targets remain at least 44px. Prefer stable grids over percentage-based flex math. Preserve the existing routes and information architecture.

Tables, lists, command bars, filters, drawers, and operational panels take priority over decorative bento cards. Overview must answer what needs attention now; it must not become a grid of equal KPI cards.

## Elevation & Depth

Create depth with the semantic surface steps and restrained borders. Use a subtle shadow only when it clarifies a drawer, popover, or elevated control. Panels should sit on the background without heavy floating effects. Do not stack decorative cards inside cards.

## Shapes

Use 8px radius for controls, 14px to 16px for panels, and pill radius only for compact status badges where the shape communicates status. Keep one radius language across a surface. A panel should represent one operational question or one coherent object.

## Iconography

New and migrated web-admin surfaces use `@phosphor-icons/react`. Navigation icons are about 20px; buttons and controls are about 18px. Use regular weight by default and fill or bold only for active navigation. Use duotone sparingly for onboarding or empty states. Icons inherit `currentColor`.

Do not mix Phosphor and Lucide within the same migrated surface. Do not remove `lucide-react` globally until every application surface has been migrated and verified.

## Components

### Shell

Use a calm persistent sidebar, a compact top context area, and a large working canvas. Active navigation uses a neutral surface with blue icon or marker accent rather than a large blue plate. Keep profile, theme, and logout actions in their existing permission-safe locations.

### Tables and lists

Prefer readable rows with stable columns, right-aligned numeric values, clear status badges, and keyboard-accessible row actions. Use drawers for contextual editing or details when leaving the list would lose useful context.

### Filters and controls

Keep filter bars compact and explicit. Preserve loading, error, empty, success, and permission-denied states. Controls need visible focus states and must not hide important scope such as the selected venue or period.

### Status and financial language

Status colors are semantic and restrained. Use `Начислено` only for a fixed payroll calculation, `Выплачено` only for an actual `PayrollPayment`, and `Предварительно` for non-fixed accruals. Use `Удержания`, never punitive language. Distinguish an employee's home venue from the actual shift venue in labels and data presentation.

## Data Visualization

Only visualize real backend data. Charts must support an operational question such as approved accrual trend or venue workload. Do not add fake charts, fake growth percentages, decorative analytics, or fabricated empty-state values. Keep chart surfaces neutral and use blue only for the data series when that is semantically appropriate.

Management revenue is not the same as a sum of shift revenue. Use saved `PayrollRun.revenue_total` for a concrete venue and period when available, and derive payroll share from saved snapshots. Do not expose management-only revenue or payroll share to employees.

## Motion

Use restrained operational motion only. Hover and pressed feedback should be approximately 120ms to 160ms; popovers and controls 160ms to 200ms; drawers and modals 220ms to 280ms. Animate transform and opacity, honor `prefers-reduced-motion`, and keep motion subordinate to task completion.

Do not use parallax, floating ambient loops, particles, WebGL, or scroll hijacking inside web-admin.

## Product Semantics

- `User.venue_id` means the employee's **Основная точка**.
- `Shift.venue_id` means the actual **Точка смены**.
- Employee accruals include the employee's shifts across venues when the product context requires personal totals.
- `Adjustment.venue_id` identifies the venue whose accruals include that bonus or deduction.
- AI summaries are read-only explanations of backend-calculated aggregates. They never decide or mutate product state.
- `Начислено` is a fixed payroll snapshot; `Выплачено` is an actual payment event; `Предварительно` is not fixed.

## Do's and Don'ts

### Do

- Keep the interface reusable across workspaces and venues.
- Make the primary action and current operational risk easy to find.
- Use real data, explicit scope, and honest states.
- Preserve accessibility, keyboard focus, light/dark themes, and existing API contracts.
- Prefer tables, lists, filters, drawers, and stable alignment over decorative composition.

### Don't

- Do not turn web-admin into a crypto, gaming, AI, or banking visual metaphor.
- Do not use purple-blue gradients, neon, glow, fake analytics, or card-inside-card layouts.
- Do not copy the Mini App dock or mobile layout into desktop web-admin.
- Do not mix home venue and actual work venue.
- Do not relabel calculated amounts as actual payments.
- Do not add a new design system, Tailwind, Motion, GSAP, or icon library without explicit approval.

## Implementation Order

1. Install and configure Phosphor.
2. Add semantic CSS variables.
3. Migrate AppShell/sidebar/header without changing routes.
4. Migrate Overview only after its layout is approved.
5. Migrate remaining screens one at a time.
6. Remove Lucide imports surface by surface.
7. Remove `lucide-react` only after full application migration.
8. Run build and visual QA after every screen.
