# RayShield Aegis — design tokens (internal reference, not rendered)

Styling in DCs is inline-only. This file is the single source of truth for literal values to reuse verbatim across every screen DC, so the product looks like one system even without shared CSS.

## Theme
All planes are light mode, including Protect/Execution (changed Sep 2026 at user request).

## Neutrals
- ink-900 #0B0E12 (dark bg base)
- ink-800 #12161C (dark surface)
- ink-700 #1B212A (dark elevated surface / border on dark)
- ink-600 #2A323D (dark muted border/divider)
- ink-500 #4A5563 (dark secondary text)
- ink-400 #6B7686 (light-mode tertiary text, dark-mode disabled)
- ink-300 #93A0AF (light-mode secondary text)
- ink-200 #C3CBD3 (light-mode border)
- ink-100 #E4E8EC (light-mode divider/hairline)
- ink-50  #F5F6F8 (light-mode page bg)
- white   #FFFFFF (light-mode card surface)

## Brand accent (teal) — never used for status
- accent-700 #0B5A61
- accent-600 #0F766E (base — links, primary buttons, active nav, focus rings)
- accent-500 #189089 (hover)
- accent-100 #E3F3F1 (tint bg for selected/active rows)

## Governance status (6-state, light-mode chips — Discovery/Fleet-Control)
- Approved     text #157F4E  bg #E7F6EE
- Unapproved   text #B4530A  bg #FDF1E4
- Prohibited   text #C4293A  bg #FCE9EA
- Under review text #2B5FCB  bg #EAF0FC
- Beta         text #7A3FC4  bg #F1E9FB
- Unlabelled   text #6B7686  bg #EEF0F2 (outlined, not filled — signals "no decision" vs the other five's filled "decision made")

## Execution status (3-state, light mode — Protect plane only, distinct hues from governance)
- Allowed  text/dot #059669
- Blocked  text/dot #DC2626
- Recorded text/dot #0284C7 (observed, neither allowed nor blocked)

## Choke-point (blast radius) — structural, NOT a status color
Diamond outline marker in ink-100/white ink on dark, ink-700 on light. Never colored red/amber — conflating "structurally important" with "severe" is the mistake the prompt pack calls out.

## Type
- Display (headings, tile numbers, nav section labels): **Space Grotesk** 500/600
- Body/UI (paragraphs, table cells, buttons, chips, labels): **IBM Plex Sans** 400/500
- Mono (CUE snippets, hashes, IPs, timestamps, endpoint IDs): **JetBrains Mono** 400/500
- Google Fonts import: `Space+Grotesk:wght@500;600;700`, `IBM+Plex+Sans:wght@400;500;600`, `JetBrains+Mono:wght@400;500`

## Spacing scale
4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 px

## Radii — deliberately tight, not "rounded-lg everywhere"
- 2px: chips, inputs, small controls
- 4px: cards, panels, buttons
- 0px: table cells/rows

## Elevation
Borders are primary separation, not shadows. One subtle shadow token for popovers/side panels only:
`0 1px 2px rgba(11,14,18,0.06), 0 4px 12px rgba(11,14,18,0.10)`

## Icons
No icon library attached, no logo provided (flag to user). Minimal self-drawn functional glyphs only (chevron, dot, dash, small stroke arrows) — never decorative illustration. Brand name rendered in Space Grotesk 600 wherever a mark would go.
