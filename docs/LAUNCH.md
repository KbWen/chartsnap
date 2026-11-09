# LAUNCH — chartsnap

> A tool is shipped when this file is done, not when the code compiles.

## Repo readiness

- [x] README first 2 lines: what it is + why care (5-second rule)
- [x] Demo GIF/screenshot above the fold — static hero (docs/hero.png) + docs/demo.gif
      captured from the real UI
- [x] Quickstart in ≤3 steps, copy-pasteable
- [x] README documents every user-facing option/flag, one real example per major mode, and a "known limitations / not for" line
- [x] Fresh collision check: competitors re-verified 2026 in the market review (see DECISIONS); SPEC re-anchored
- [x] Decide public/PRs — CONTRIBUTING.md added; no SKIPPED-rule log to worry about. Open call: DECISIONS.md openly records AI-assisted process (fine by me, but see chat — user's choice)
- [x] License chosen (MIT default for tools) — see LICENSE
- [x] Up to 20 GitHub topics, keyword-front-loaded About (searchable > clever) — 15 topics + description set
- [x] If web tool: GitHub Pages deployed, link in About — https://kbwen.github.io/chartsnap/ (CI + deploy green)
- [ ] repo ≥30 days old before any sindresorhus/awesome PR (create early, launch later)

## Evidence of function

- [x] End-to-end run on real input, output verified here (2026-11-03):
      - All 3 auto-detect paths rendered from real CSVs (samples/): date→line,
        category→bar, two-numeric→scatter — confirmed visually and in tests.
      - Automatic horizontal bar layout preserves legibility for long or numerous category labels.
      - Forcing `line` on 2-number data preserves continuous numeric X-axis with proportional spacing.
      - Robust real-world cleaning verified: single-cell title row extraction, trailing summary
        row exclusion (`Total`/`合計`), accounting negatives (`(500)`), currency/percentage stripping,
        CJK magnitude normalization (`億元`/`萬元`/`千元`/`元`), year-first dot dates (`2025.01.05`),
        and calendar quarters (`2025-Q1`).
      - 3 curated de-AI business themes (editorial, corporate, nordic) verified across
        all 5 export presets (Slide 16:9, Twitter card, IG post, IG story, A4 print) — 45 total
        artifact combinations in test/e2e-audit.test.ts.
      - SVG export produces valid vector output with responsive viewBox and exact theme
        backgrounds and lead colors for all types and presets.
      - PNG export produces real PNGs with valid 8-byte PNG header signatures; 1-click Copy PNG
        copies image blobs directly to clipboard with descriptive slugified filenames on download.
      - Machado 2009 CVD simulation achieves min pairwise ΔE00 ≥ 15.0 for protanopia
        and deuteranopia on all themes; WCAG graphical contrast ≥ 3:1 across ±1 neighbourhood.
      - `npm run build` succeeds (lean static bundle); zero CSP violations.
      - Total test suite: 562 / 562 tests green across 25 test files.

## Owner handoff

- [ ] If you keep a product list / content hub: register this tool there (skip if not applicable)
- [x] Demo assets exported (GIF, screenshots) — docs/hero.png + docs/demo.gif + docs/themes-preview.png
- [x] One-line channel-fit note: Show HN + r/webdev / r/dataisbeautiful, and people searching
      "csv to chart no upload" / "csv chart offline" — the privacy angle is the hook

## Post-launch

- [ ] First 3 pieces of feedback (issues/comments/DMs) triaged back into SPEC
      "Later" list or DECISIONS.md
- [x] After any change to flags/usage, re-verify the README quickstart against a real run
      — verified 2026-11-03 for v1.12: 5 export presets (incl. 16:9 Slide), 1-click Copy PNG,
      slugified filenames, horizontal bars, continuous numeric X-axis, and CJK magnitude normalization.
