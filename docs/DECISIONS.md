# DECISIONS — chartsnap

> One line per non-obvious decision. Newest on top.
> Format: `YYYY-MM-DD — decision — why (one clause)`

<!-- example: 2026-01-15 — chose heic-decode over heic2any — maintained + smaller -->
<!-- example: 2026-01-16 — Progress: done <csv parser>; next <pdf render>; blocked <none> -->
<!-- override log format (see AGENTS.md Core Rules): YYYY-MM-DD — SKIPPED <rule> for <what> — <reason> -->
- 2026-07-06 — de-AI pass after a second review round (4 human-persona lenses hunting AI-ness): quirky real hero (weekly commits w/ a gap, not synthetic revenue), pine accent off the default teal + muted support colours + near-square bars, wordmark out of mono, tighter copy (dropped "zero setup"/"sensible"/"clean"), trimmed over-narrating comments, real EU-number TODO, CONTRIBUTING.md, demo GIF captured from the real UI via Playwright. Held the honesty line: did NOT fake human git history or strip AI attribution (that's concealment, not craft).
- 2026-07-06 — SHIPPED: public repo https://github.com/KbWen/chartsnap, live at https://kbwen.github.io/chartsnap/ (GitHub Pages via Actions); CI + deploy workflows green; topics + About + homepage set; README rewritten in a plain human voice.
- 2026-07-06 — Progress: done <v1.1 per user decisions: (1) escape hatch = minimal line/bar/scatter override toggle, scatter disabled when <2 numeric cols, categorical-line rendering added to chart.ts, detectChart(force) + feasibleTypes(), 5 new tests; (2) repositioning re-anchored on privacy/offline/deterministic in SPEC+README; also preview animation off for snappy render>; next <remaining LAUNCH items: animated GIF, GH topics/About, deploy>; blocked <none — note: preview screenshot tool times out on live canvas in this env; verified toggle via prod build inspection + tests>
- 2026-07-06 — escape hatch decided L1 (user): a single line/bar/scatter toggle, NOT field mapping — SPEC Non-goals amended to allow it; default stays auto-detected
- 2026-07-06 — repositioning decided (user): headline = privacy/offline/deterministic; free SVG demoted to a supporting feature (the trio is 2026 commodity per the review)
- 2026-07-06 — added Vitest + an SVG smoke test as the canary for the canvas2svg pipeline; pinned chart.js + canvas2svg to exact versions so a silent minor bump can't break the shimmed SVG export unnoticed
- 2026-07-06 — default line `tension: 0` (was 0.35) — smoothing fabricated values between sparse real data points (flagged as the loudest data-viz objection in the review)
- 2026-07-06 — `year` columns (4-digit 1900–2099) now detected as time → line, not scatter (common `year,value` CSVs were charting wrong)
- 2026-07-06 — did NOT auto-sort categorical bars by value (review asked): auto-sorting silently breaks inherently-ordered categories (e.g. months); deferred to SPEC "Later" as opt-in
- 2026-07-05 — chart theme pass (the shareable output, so it matters most): curated warm-editorial palette (teal-green + ochre lead), left-aligned title, horizontal-only hairline grid, no axis spines, muted ticks, rounded bar tops, smooth clean lines, warm #fffdf8 export bg shared PNG+SVG via EXPORT_BG; avoided semi-transparent fills/gradients to keep canvas2svg SVG output faithful
- 2026-07-05 — UI re-skin (chrome only, no logic change): warm-paper + ink/hairline palette, monospace "data-tool" accents (wordmark, meta labels), left-aligned header, ink buttons — deliberately off the AI-default look (cold gray, Tailwind blue, centered hero, uniform-radius cards)
- 2026-07-05 — Progress: done <all 5 Done criteria built + verified; UI design pass>; next <ship: demo asset, deploy to Pages, README polish>; blocked <none>
- 2026-07-05 — SVG export uses canvas2svg with 3 workarounds — shim resetTransform/get+setLineDash/roundRect (lib predates Chart.js v4), force line datasets' `segment:{}` so Chart.js skips its Path2D cache (canvas2svg can't read Path2D), and a quote/digit-free global font family (canvas2svg's font regex rejects quoted families); SVG bg injected as first <rect> since destination-over compositing is a no-op in SVG
- 2026-07-05 — A4 preset fixed at 3508×2480 (landscape, 300 DPI) — chart-friendly aspect; documented in README
- 2026-07-05 — chose Chart.js over D3 — canvas render, built-in line/bar/scatter, small bundle, best zero-config fit; SVG export needs a separate vector path (validate early)
- 2026-07-05 — SPEC confirmed by user in chat (shown Done criteria v1) — code may now be written
- 2026-07-04 — SPEC drafted in planning session from repo-portfolio BACKLOG dossier; competitor stars verified same day — new sessions: confirm SPEC with user before code
