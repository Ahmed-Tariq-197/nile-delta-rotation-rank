# RotaNile implementation plan

## Scope

Build the static RotaNile app described by R5 parts 1A and 1B, beginning with its foundation and then implementing the four working views. Preserve the supplied official Nile Orbit Lab logo and make the requested browser and Apple icon sizes from it without changing its artwork.

## Work

1. Replace the starter screen with a static, tool-neutral RotaNile app and responsive deep-space scientific design system.
2. Implement the deterministic request/types/data adapters, accessible navigation, URL state, planner controls, charts, tables, evidence details, method/data, global and about views described by R5.
3. Add all requested PNG, ICO and Apple touch icon files, and update page titles, descriptions and icon links.
4. Remove platform-branded telemetry, comments, package/configuration references and placeholder documentation from editable app files; retain only required RotaNile/Nile Orbit Lab branding.
5. Run app tests and inspect the preview, build diagnostics, page metadata and icon responses. Audit source files and current history for remaining identifiers.

## Technical approach

- Use a static Vite + React + TypeScript app with client-side navigation matching R5's shareable view paths; no backend or server-only features.
- Keep the business rules in typed, testable helpers and treat missing supplied datasets/engine as explicit unavailable states. Do not substitute made-up values for missing authoritative results.
- Use local project assets and semantic CSS tokens; the user's uploaded logo is the only brand artwork.

## Known limits

- The uploads contain the R5 specification, contract definitions and pipeline source archives, but no ready-to-use browser bundle or engine implementation. Working engine-backed calculations require those missing team deliverables.
- Platform-managed repository history and the sandbox's internal repository origin are outside editable application source. The existing commit history will be audited but not rewritten.