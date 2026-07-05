# LAUNCH — chartsnap

> A tool is shipped when this file is done, not when the code compiles.

## Repo readiness

- [ ] README first 2 lines: what it is + why care (5-second rule)
- [~] Demo GIF/screenshot above the fold — static hero (docs/hero.png) is in the README;
      an animated drop→chart→export GIF still to record
- [ ] Quickstart in ≤3 steps, copy-pasteable
- [ ] README documents every user-facing option/flag, one real example per major mode, and a "known limitations / not for" line
- [ ] Fresh collision check: nearest competitors + their stars as of launch week (update SPEC if the landscape moved)
- [ ] Decide: are SPEC/DECISIONS competitor notes OK to be public? Is the DECISIONS SKIPPED log OK to publish (≥3 skips → review first)? Accepting outside PRs? → add a 2-line CONTRIBUTING note
- [x] License chosen (MIT default for tools) — see LICENSE
- [ ] Up to 20 GitHub topics, keyword-front-loaded About (searchable > clever)
- [ ] If web tool: GitHub Pages deployed, link in About
- [ ] repo ≥30 days old before any sindresorhus/awesome PR (create early, launch later)

## Evidence of function

- [x] End-to-end run on real input, output verified here (2026-07-05):
      - All 3 auto-detect paths rendered from real CSVs (samples/): date→line,
        category→bar, two-numeric→scatter — confirmed visually (PNG renders).
      - SVG export produces valid vector output for all types (verified in-browser
        and via a headless jsdom+node-canvas render).
      - Edge cases exercised: quoted commas, thousands separators, missing values,
        >1,000-row sampling, non-UTF-8 fallback message.
      - Zero data-carrying network requests (DevTools Network tab: only localhost
        app assets; source has no fetch/XHR/beacon/WebSocket).
      - `npm run build` succeeds; dev-only test bridge stripped from the bundle.
      - Still TODO for launch: export a demo GIF/screenshot; deploy to Pages.

## Owner handoff

- [ ] If you keep a product list / content hub: register this tool there (skip if not applicable)
- [ ] Demo assets exported (GIF, screenshots)
- [ ] One-line channel-fit note: where would this tool's audience actually see it?

## Post-launch

- [ ] First 3 pieces of feedback (issues/comments/DMs) triaged back into SPEC
      "Later" list or DECISIONS.md
- [ ] After any change to flags/usage, re-verify the README quickstart against a real run
