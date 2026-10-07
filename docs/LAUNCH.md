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

- [x] End-to-end run on real input, output verified here (2026-10-07):
      - All 3 auto-detect paths rendered from real CSVs (samples/): date→line,
        category→bar, two-numeric→scatter — confirmed visually and in tests.
      - 3 curated de-AI business themes (editorial, corporate, nordic) verified across
        all 4 export presets (36 total artifact combinations in test/e2e-audit.test.ts).
      - SVG export produces valid vector output with responsive viewBox and exact theme
        backgrounds and lead colors for all types and presets.
      - PNG export produces real PNGs with valid 8-byte PNG header signatures.
      - Machado 2009 CVD simulation achieves min pairwise ΔE00 ≥ 15.0 for protanopia
        and deuteranopia on all themes; WCAG graphical contrast ≥ 3:1 across ±1 neighbourhood.
      - `npm run build` succeeds (234 kB lean bundle); zero CSP violations.
      - Total test suite: 431 / 431 tests green across 19 test files.

## Owner handoff

- [ ] If you keep a product list / content hub: register this tool there (skip if not applicable)
- [x] Demo assets exported (GIF, screenshots) — docs/hero.png + docs/demo.gif + docs/themes-preview.png
- [x] One-line channel-fit note: Show HN + r/webdev / r/dataisbeautiful, and people searching
      "csv to chart no upload" / "csv chart offline" — the privacy angle is the hook

## Post-launch

- [ ] First 3 pieces of feedback (issues/comments/DMs) triaged back into SPEC
      "Later" list or DECISIONS.md
- [x] After any change to flags/usage, re-verify the README quickstart against a real run
      — done 2026-07-10 after the v1.2/v1.3 README edits: wiped `node_modules`, ran
      `npm install` then `npm run dev`, and checked every claim in the README's chart
      table plus the six-series note, deterministic SVG, and the three export presets.
      (Standing rule: re-tick this after the next usage change.)
