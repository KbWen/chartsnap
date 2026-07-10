# SPEC — chartsnap

> Drafted 2026-07-04 in the planning session from repo-portfolio/BACKLOG.md.
> Status: CONFIRMED 2026-07-05 — user confirmed Done criteria v1 in chat after being
> shown them. Chart library locked to Chart.js (see DECISIONS.md). Code may be written.

## What is this

Drop a CSV onto a static web page → get a clean chart sized for social media or
print → export PNG/SVG. No upload, no signup, no configuration.

## Who is it for, and what pain does it solve

Someone with a small CSV (sales numbers, survey results, a workout log) who needs a
decent-looking chart for a tweet / IG post / report right now. Current options all
fail them: Excel (ugly defaults, screenshot workflow), RAWGraphs (grammar-of-graphics
learning curve), Datawrapper/Flourish (signup + SVG paywalled), matplotlib (code).

## The small differentiation (一點點差異性)

> Re-anchored 2026-07-06 after a multi-agent review (see DECISIONS): in 2026 the
> "zero-config + named presets + free SVG" trio is largely commodity — multiple free
> tools (ChartLoad, Kanaries, DataToChart…) already bundle it. So that trio is the
> ante, not the wedge.

- **The defensible wedge is privacy / offline / deterministic.** Your data never leaves
  the browser (no upload, no server — verifiable in the Network tab); it works offline
  after first load; and the same CSV always produces the same chart. Neither the hosted
  free tiers nor an LLM ("upload your CSV, make me a chart") can honestly claim all three.
- Zero-config auto-detection, the named export presets (Twitter / IG / A4), and free
  unlimited SVG (Datawrapper and Flourish do gate SVG behind paid plans — verified
  2026-07-04) remain real, differentiating *features* — but they are supporting cast,
  not the headline.
- Nearest config-heavy tool: RAWGraphs — https://github.com/rawgraphs/rawgraphs-app,
  ~9,009★ (verified 2026-07-04) — browser-local like us, but drag-fields-onto-axes.

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

## v1.1 — decided 2026-07-06 (after the multi-agent review)

- [ ] **Chart-type override (escape hatch):** a minimal line / bar / scatter toggle so a
      wrong auto-detection isn't a dead end. Default stays auto-detected; scatter is
      disabled when there are <2 numeric columns. This is the ONLY manual control — not a
      field/axis mapping UI.
- [x] Re-anchor positioning on privacy / offline / deterministic (see differentiation
      section + README); free SVG demoted from headline to supporting feature.
- [x] Hardening: Vitest suite incl. an SVG smoke test guarding the canvas2svg pipeline;
      chart.js + canvas2svg pinned to exact versions; CI runs test + build.
- [x] Adoption: one-click sample-data buttons; static README hero (animated GIF still TODO).
- [x] Correctness: line `tension`→0 (no fabricated values); 4-digit `year` column → line.

## v1.2 — decided 2026-07-10 (scope confirmed by the user in chat after the audit)

Both items are cases where chartsnap draws a chart that is *wrong* and says nothing.
That is the one failure mode this tool must not have — a wrong chart that looks fine is
worse than an error message.

### Done criteria (v1.2)

- [x] A bare calendar date (`2025-01-01`, `2025-01`, `2019`) is parsed as **local**
      midnight, so the axis shows the same day in every timezone. A cell that carries a
      time or an explicit offset (`2025-01-01T09:30:00Z`) keeps its exact instant.
- [x] European numbers parse correctly when the column proves it: `1.234,56` → 1234.56,
      `1.234.567` → 1234567, `12,5` → 12.5. American stays untouched: `1,234.56` →
      1234.56, `3,850,000` → 3850000, `2,500` → 2500.
- [x] A genuinely undecidable column (`3.850` alone could be 3.85 or 3850) still renders,
      and a note names **both** readings. No silent 1000x error.
- [x] No new note for ordinary decimals (`0.125`, `1.25`) or ordinary US thousands (`2,500`).
- [x] Convention is decided per **column**, not per cell — one cell can't settle it.
- [x] When one stray cell proves a separator's role and thereby rescales the rest of the
      column by 1000x, the chart still renders (that reading is the coherent one) but a
      note names both readings. Holds in **both** directions: `2,500 … 12,5` and
      `3.850 … 1.25`. When a separator is *proven* to be a grouping mark
      (`1.234.567`, `3,850,000`), the reading is certain and nothing is said.

## Non-goals / Later / Not now

- NO field/axis mapping or chart-type gallery UI (that is RAWGraphs' turf — we lose if we
  compete there). The single line/bar/scatter override above is an escape hatch, NOT field
  configuration; zero-config stays the default.
- No dashboards, no multi-chart, no data storage, no accounts, no analytics, no AI
- Later: color/theme presets, .xlsx input, editable chart title/labels
- Later (surfaced by the review — see DECISIONS): sort categorical bars by value +
  horizontal bars for long labels; aggregate (sum/count) categorical data instead of
  plotting/sampling raw rows; locale-aware number parsing (EU `1.234,56`); data labels on bars.
- Later (found 2026-07-10): a `year,value` CSV labels its x axis by month ("Feb 2019",
  "Aug 2019") because Chart.js only switches to year labels once the span covers
  `numTicks-1` years. Pin `time.unit: "year"` when the date column was detected from
  bare 4-digit years.

### Found by the 2026-07-10 audit (all pre-existing; ranked by how badly they mislead)

1. ~~EU thousands-dot (`3.850`) parses as `3.85` — off by 1000x, silently.~~
   **Fixed in v1.2**: the convention is detected per column, and a column nothing can
   settle renders with a note naming both readings.
2. ~~`2025-01-01` parsed as UTC midnight but drawn on a local-time axis, so anyone west
   of UTC sees "Dec 31".~~ **Fixed in v1.2**: bare calendar dates are local midnight.
3. **Data dropped silently.** A 7th numeric column is discarded (`yColumns.slice(0, 6)`)
   with no note to the user. Either say so in `notes`, or raise the cap.
4. **The offline claim has nothing behind it.** Nothing registers a service worker, so
   "works offline after first load" relies on whatever the browser HTTP cache retains
   (the live Pages cache headers were not measured). Either ship a tiny service worker,
   or soften the claim — it is one third of the stated wedge.
5. **SVG export is not byte-reproducible** — canvas2svg mints random `clipPath` ids each
   run. The drawing is identical; only the ids churn. PNG *is* byte-identical.
6. A fully blank header row is eaten by `skipEmptyLines: "greedy"`, so the first data row
   becomes the header and the `Column N` fallback never fires.
7. **The bare-year heuristic is a footgun** (found by the 2026-07-10 expert review). Any
   4-digit integer in 1900–2099 is read as a year, so a `count` column of `2000, 2010,
   2020` becomes a time axis — and `1898, 1899, 1900…` charts differently from `2018,
   2019, 2020…` because the first two fall outside the window. Consider requiring a
   temporal-looking header, or monotonicity.
8. A raw C0 control character in a cell (e.g. NUL) passes into the exported SVG, which is
   then not well-formed XML and won't open. Fail-closed, never a script path — but strip
   C0 from labels and it becomes a non-issue.

## Tech shape

Static single-page app: Vite + vanilla TypeScript + one lean chart library
(Chart.js vs D3 — decide at build time, log the choice in DECISIONS.md).
PapaParse for CSV parsing. GitHub Pages deploy. No backend.
