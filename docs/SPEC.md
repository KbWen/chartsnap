# SPEC — chartsnap

> Drafted 2026-07-04 in the planning session from repo-portfolio/BACKLOG.md.
> Status: DRAFT — per AGENTS.md Core Rule 1, the user must confirm this SPEC in chat
> (after being shown it) before any code is written.

## What is this

Drop a CSV onto a static web page → get a clean chart sized for social media or
print → export PNG/SVG. No upload, no signup, no configuration.

## Who is it for, and what pain does it solve

Someone with a small CSV (sales numbers, survey results, a workout log) who needs a
decent-looking chart for a tweet / IG post / report right now. Current options all
fail them: Excel (ugly defaults, screenshot workflow), RAWGraphs (grammar-of-graphics
learning curve), Datawrapper/Flourish (signup + SVG paywalled), matplotlib (code).

## The small differentiation (一點點差異性)

- Nearest existing tool: RAWGraphs — https://github.com/rawgraphs/rawgraphs-app,
  ~9,009★ (verified 2026-07-04, active) — browser-local like us, but config-heavy
  (drag fields onto axes) and data-journalism-oriented.
- Our difference: all three of — (1) zero-config: chart type auto-detected from CSV
  shape; (2) export presets literally named "Twitter card / IG post / A4 print";
  (3) free unlimited SVG export (Datawrapper and Flourish both gate SVG behind paid
  plans — verified 2026-07-04). Any one alone is not enough; the wedge is the trio.

## Done criteria (v1)

- [ ] Drop/paste a CSV → a sensible default chart renders with ZERO configuration
      (auto-detect: date/time column → line; categories + numbers → bar;
      two numeric columns → scatter)
- [ ] One-click export presets: Twitter card 1200×675, IG post 1080×1080, A4 print —
      PNG and SVG, both free, no watermark
- [ ] Edge cases handled: quoted commas, missing values, >1,000 rows (sample or
      graceful message), non-UTF-8 fallback message
- [ ] 100% client-side: works offline after first load; zero network requests
      carrying user data (verifiable in devtools Network tab)
- [ ] Deploys as a static site on GitHub Pages

## Non-goals / Later / Not now

- NO chart-type gallery or axis/field configuration UI (that is RAWGraphs' turf —
  we lose if we compete there; zero-config IS the product)
- No dashboards, no multi-chart, no data storage, no accounts, no analytics, no AI
- Later: color/theme presets, .xlsx input, editable chart title/labels

## Tech shape

Static single-page app: Vite + vanilla TypeScript + one lean chart library
(Chart.js vs D3 — decide at build time, log the choice in DECISIONS.md).
PapaParse for CSV parsing. GitHub Pages deploy. No backend.
