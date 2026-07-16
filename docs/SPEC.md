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

> All five verified against a real run on 2026-07-10 (see DECISIONS). They had been true
> since 2026-07-05 — the boxes were simply never ticked.

- [x] Drop/paste a CSV → a sensible default chart renders with ZERO configuration
      (auto-detect: date/time column → line; categories + numbers → bar;
      two numeric columns → scatter)
- [x] One-click export presets: Twitter card 1200×675, IG post 1080×1080, A4 print —
      PNG and SVG, both free, no watermark
- [x] Edge cases handled: quoted commas, missing values, >1,000 rows (sample or
      graceful message), non-UTF-8 fallback message
      — **narrower than intended (2026-07-16).** True as written: a non-UTF-8 fallback
      message exists and fires when mojibake dominates. But the guard divides replacement
      chars by *total text length* (`csv.ts:26`, threshold `0.002`), and for a file whose
      Chinese sits only in the header the numerator is fixed while the denominator grows —
      so it decays to zero. Measured on a Big5 `月份,營收` header + `i,10i` rows: caught at
      200 rows, blind at 1,000 (4 replacements in 8,001 chars = 0.05%). The crossover row
      count depends on header length and row width — an earlier note said 166/167 for a
      different file; both are correct, which is why the file must be named.
      **Re-earned in v1.4** with a stronger claim than this one made: the guard now weighs
      failed decodes against successful ones, so it is size-independent, and it also catches
      Latin-1 and UTF-16LE, which it never did.
- [x] 100% client-side: works offline after first load; zero network requests
      carrying user data (verifiable in devtools Network tab). The offline half of this
      only became true in v1.3, when a service worker started backing it.
- [x] Deploys as a static site on GitHub Pages

## v1.1 — decided 2026-07-06 (after the multi-agent review)

- [x] **Chart-type override (escape hatch):** a minimal line / bar / scatter toggle so a
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

## v1.3 — decided 2026-07-10 (clearing the whole "Later" backlog from the audit)

Everything the audit and the expert review left open. Two of these — the offline claim and
SVG reproducibility — are load-bearing parts of the stated wedge (privacy / offline /
deterministic), so leaving them unbacked was the worst item on the list.

### Done criteria (v1.3)

- [x] **The offline claim is true.** A service worker precaches the built assets, so the
      page loads and charts with the network down. Verified by stopping the server and
      reloading. No new dependency: the worker is generated at build time from the real
      asset list.
      — **narrower than intended (2026-07-16).** True as written, and its own named test
      still passes. But "the network down" is only the case where `fetch` *rejects*. The
      handler is `fetch(req).catch(…)` (`vite.config.ts:44`), and `.catch` never fires on a
      request that hangs instead of rejecting — so a captive portal or VPN blackhole gives a
      white screen indefinitely while a complete copy sits in the cache. Verified against a
      server that accepts the connection and never answers. The README gains the caveat in
      v1.4; the fix is in Later, because a naive `Promise.race` makes things *worse* (it
      discards the fresh response, and with the `sw.js` version bug below it would pin
      slow-tail users to an old build permanently).
- [x] **SVG export is byte-reproducible.** The same CSV twice produces identical bytes.
      (canvas2svg mints random `clipPath` ids; they are renamed deterministically.) PNG
      already was byte-identical.
- [x] **No numeric column disappears in silence.** Beyond the 6-series cap (and beyond the
      2 columns a scatter uses), the chart names the columns it left out.
- [x] **A blank header row survives** as `Column 1, Column 2 …` instead of being eaten and
      promoting the first data row to the header. Blank *lines* around the data are still
      ignored.
- [x] **A bare 4-digit number is only a year when the header says so** (`year`, `yr`, `年`).
      A `count` column of `2000, 2010, 2020` is numbers, not a time axis. And a column that
      *is* bare years labels its axis by year — no more `Feb 2019`, `Aug 2019`.
      — holds as written; the lesson is that it was too weak to falsify. "Says so" is
      implemented as a bare substring for `年`, so `去年營收` matches too — but only *bites*
      when the values are themselves bare 4-digit numbers in 1900–2099 (revenue in NT$
      thousands: `店別,去年營收,今年營收` with `2000,2100` charts a year-axis line and drops
      店別). With `100,120` the same file is already correct, which is how a criterion written
      from the example rather than the mechanism ticks itself. The English branch has the
      identical bug — `last_year_revenue`, `year_end_bonus`, `3-yr-avg` and `Year over Year %`
      all match `YEAR_HEADER` today. Deferred to Later: a fix must close both scripts, and the
      obvious `$`-anchor breaks `年份(西元)` / `年度別`.
- [x] **A control character can't break the export.** C0 chars (illegal in XML) are
      stripped from names and cells, so the SVG stays well-formed. Tabs/newlines survive.

## v1.4 — revised 2026-07-16 (first draft rejected 4/4 by a stress test; scope chosen by the user)

The first draft of this section was rejected by a Tenth Man, a pre-mortem, a SPEC audit and a
technical validation — independently, unanimously, and with executed evidence. See DECISIONS
for what killed it. The short version: it was going to delete `Date.parse` (which would have
turned every ISO-timestamped CSV in the world into a bar chart), ship an encoding heuristic
that refuses a valid UTF-8 file over one stray byte, and anchor a `年` regex in a way that
breaks `年份(西元)` — the house style of the very zh-TW open data it was written for.

What is left is small, and **every mechanism named below was verified by an executed run
before it was written down** — that is the change in method, not just in scope.

Rule learned, binding on the criteria below: **a criterion that only names what must start
working is half a criterion.** Each one names what must keep working, with the values that
actually trigger the bug — the first draft's `年` example (`A店,100,120`) passed unchanged,
because 100 is not a 4-digit year.

### Done criteria (v1.4)

- [x] **A date cell is shape-checked before `Date.parse` sees it.** `cleanTime` matches the
      cell against a closed list of shapes; anything unmatched is a category and never a date.
      `Date.parse` stays — it is *spec-defined* for ISO input and only engine-defined for the
      rest, so what closes is the engine-defined path, not the function. The list: ISO calendar
      dates (`2019`, `2025-01`, `2025-01-05` — still local-midnight per v1.2), ISO instants
      (`2025-01-01T09:30:00Z`, `2025-01-05T09:30:00+08:00`), `YYYY-M-D HH:MM(:SS)`, `YYYY/M/D`,
      `Mmm YYYY`, `D Mmm YYYY`, `Mmm D, YYYY`.
      Four silent wrong charts this kills, all reproduced today: `12.3%` → 2001-12-03;
      `45%` → 2045-01-01 (a percent column becomes a **time axis** and the real category column
      silently disappears); `Jan-25` → 25 Jan 2001; `114/01/05` → year 114 AD. Each becomes a
      category instead.
      **What must keep working** — a committed fixture lists every shape above; any of them
      turning from `line`/`timeAxis:true` into `bar` is a failure, not a trade. This is the
      whole risk of the item: `detect.ts:44` sends dates to `line` and categories to `bar`, so
      a regression here redraws irregular samples at equal width, which is the exact lie v1.2
      exists to prevent.
      **Known and accepted:** `Jan-25` and `114/01/05` become categories rather than being read
      correctly — reading them needs a parser and a note mechanism, deferred to Later. A `$1234`
      or `45%` column that is the *only* numeric column now throws "No numeric column found to
      chart" — a loud, badly-worded failure, which beats a confident wrong chart.

- [x] **A Big5/CP950 CSV is caught at any file size.** The guard counts replacement chars
      (`repl`) and *successfully decoded* non-ASCII chars (`valid`), and fires on
      `repl >= 2 && repl > valid`. No ratio against text length — that is what decayed — and no
      ratio against non-ASCII either: measured, `Big5 header + 1000 rows`, `Latin-1 French` and
      `UTF-16LE+BOM` (all must refuse) and `UTF-8 + one stray byte` (must pass) **all sit at
      ratio 1.000**, so no threshold of that shape can separate them. Only the absolute count
      does. `repl` is independent of file size for a header-only-Chinese file: a Big5
      `日期,營收` header yields repl=7 at 5 rows and repl=7 at 1,000.
      **Must refuse** (all three pass today at 1,000 rows — the guard is worse than the SPEC
      admits): Big5 header + 1,000 ASCII rows; Latin-1 with French names; UTF-16LE+BOM, i.e.
      Excel's "Unicode Text" export.
      **Must keep rendering:** valid UTF-8 Chinese with and without BOM; an emoji column; a real
      UTF-8 file carrying one stray bad byte (repl=1, under the floor); a valid UTF-8 file
      truncated mid-character at a chunk boundary.
      **Known and accepted:** a Latin-1 file with exactly one accent is *provably* undecidable —
      it is identical in (repl, valid) to a UTF-8 file with one stray byte — and the stray-byte
      case wins. Re-earns the v1 criterion with a stronger claim than it originally made.

- [x] **Every note is legible.** `.notes` uses `--muted` (#6c6659, 5.19:1 on paper), not
      `--faint` (#948d7c, **3.00:1** — fails WCAG AA at 12.8px). Measured, not eyeballed.
      This is a v1.4 blocker rather than a v1.5 line item because every note v1.2 and v1.3 ever
      added — including the one that says the chart is wrong by 1000× — currently renders in a
      colour this repo's own audit records as unreadable. An unreadable warning is not a warning,
      and two reviewers independently refused to let new notes ship into that channel.

- [x] **The tripwire actually trips.** Today `ci.yml` and `deploy.yml` are independent workflows
      on the same `push: [main]` trigger, so a red SVG smoke test still ships. Deploy runs only
      after tests pass — **proven by pushing a deliberately failing test and showing the deploy
      job did not run**, not by watching a green build; the edge case for a gate is the red case.
      **Corrected during implementation:** this criterion first said "the hermetic suite gates
      deploy and the canvas suite gates the merge", to keep an apt-mirror hiccup off the release
      path. That does not work here — the repo is solo, pushes go straight to `main`, and there
      is no branch protection, so "gates the merge" gates nothing and a broken SVG export would
      still deploy, which is the entire problem. The suite runs on the deploy path; the cost is
      a duplicate apt+test on `main` and a deploy that fails closed.
      And the smoke test must *assert* on the parse, not merely perform it:
      `new DOMParser().parseFromString(svg, "image/svg+xml")` **does not throw** on malformed
      XML — it returns a document containing `<parsererror>` — so "it XML-parses its output"
      is satisfiable by one line that can never go red. Assert `querySelector("parsererror")`
      is null. Proven by running a `` header through with `scrub` disabled: the new
      assertion goes red where today's `expect(svg).toContain("<svg")` stays green.
      (DECISIONS already records jsdom's duplicate `xmlns:xlink` as a verified jsdom artifact —
      normalize it, don't chase it.)

- [x] **The README says what the code does.** Closed list, so it has an oracle: *"the same CSV
      always gives you the same chart, down to identical bytes"* → scoped to the same machine
      **and browser** (`system-ui` resolves per OS, text positions are baked from local metrics,
      and `Date.parse` is engine-defined until the shape check above lands). *"It works offline"*
      → gains "a hanging connection can still stall it; a captive portal that answers 200 will
      win." Bundling a font to make the unscoped determinism claim true is **Later**, not an
      `or` branch here: it would take the 240 kB precache into the megabytes and fight the
      offline third of the wedge to strengthen the deterministic third.

## v1.5 — the things you only find by looking (decided 2026-07-16)

Started as "mobile", pulled ahead of the remaining parser work because P(a real user hits it)
≈ 1.0 versus ≈ 0 for the encoding edge cases: the headline is "a chart you can post",
`grep -c "@media" src/style.css` returned **0**, and on the device people post from the export
was a dead end. Two independent adversaries reached that ordering without being asked to.

It grew — and got its real name — when someone finally opened the PNG. **Every remaining item
here is a defect that 16 reviewers, 120 green tests and a session of measurements could not
see, because all of them were reading code or checking numbers about the output rather than
looking at the output.** Kept as v1.5 rather than opened as a v1.6: it is the same discovery
method and the same surface (the exported artifact), the release is not finished, and a version
number that increments faster than the ideas behind it is just a counter.

- [x] **The page works on a phone.** A `@media` block exists. Measured at 375px, before → after:
      `.chip` 27→44, `.type-btn` 25→44, `.btn` 36→44, the paste box 13.6px→16px (below 16, iOS
      zooms on focus and never zooms back). 44px is set as a floor via `min-height`, not derived
      from padding — the first attempt did that and landed on 39px. The drop zone leads with
      "Choose a CSV", which works on every device, instead of "Drop a CSV here", which is
      impossible on the one most visitors bring. Desktop verified untouched at 1280px.
      Nothing overflowed at 375px before the change either — that part of the review didn't
      survive measurement, and is recorded here rather than quietly dropped.
- [ ] **A time axis is labelled with the data's own dates.** The tick unit follows the data's
      spacing instead of being left to Chart.js, which picks `unit: "day"` for *every* monthly
      series — measured at 3, 6 and 12 points, all `day`. Today the bundled `monthly-sales.csv`,
      the front-page sample and the README hero's sibling, renders
      `Jan 1, Feb 12, Mar 26, May 7, Jun 18, Jul 30, Sep 10, Oct 22` for 12 points that sit on
      the 1st of each month: only the first label is a data point. At 3 points it renders
      `Jan 1, Jan 9 … Feb 26` — 8-day ticks — and Mar 1 falls past the last label entirely.
      v1.3 fixed exactly this for bare years by setting `time.unit` when `yearAxis` is true
      (`chart.ts:253`) and left months untouched.
      **After:** monthly data ticks by month (`Jan 2025, Feb 2025 …`), and every label names a
      date the data actually has.
      **Must keep working, and this is the whole risk:** `docs/hero.png`'s weekly data is
      correct *today* — weekly points sit on the same fixed 7-day grid that day-unit ticks use,
      so its 14-day ticks land on every second point. Daily, weekly, quarterly and yearly data
      must each still label sensibly; a fixture pins one of each, run before the change. The
      hero is why this survived four releases: the only chart anyone ever looked at was the one
      shape that cannot show the bug.
      **Verified by looking at the rendered PNG**, not by asserting `timeAxis === true` — which
      is true today, and true while the axis is wrong.
- [ ] **A posted chart is legible at the size it is posted at.** `fontScale` is
      `clamp(min(w,h)/700, 1, 4)`, which puts a Twitter card's ticks at 12px on a 1200px-wide
      image — **1% of the width** — and its title at 25px, ~2%. Look at any export and the title
      reads as a footnote in the corner; `docs/hero.png` has the same problem at 2400px wide.
      A Twitter card renders at ~500px on a phone, so a posted chart's labels land at ~5px.
      **This criterion started life as "the preview is legible on a phone" and that diagnosis
      was wrong**, which is why it is worth keeping the history: it blamed `previewSize` capping
      at 1400 bitmap px, but a 1200×675 export shown at 312 CSS px genuinely *is* 3.1px text —
      the preview is an honest scaled view and any image viewer agrees. The preview was never
      lying; it was reporting that the export is sized for a monitor. Rescaling the preview would
      have made it lie to hide the real defect, and would have ticked the box.
      **After:** a floor on type size relative to the image's short edge, checked across every
      preset (Twitter, IG post, IG story, A4) — the A4 case runs the other way, where `fontScale`
      pins near its ceiling and the constraint is print, not a phone.
      **Verified by looking**, at every preset, at the size each is actually consumed at.
- [x] **The export reaches the camera roll.** `navigator.share({ files: [...] })` behind a
      `navigator.canShare` gate, with `downloadBlob` as the desktop fallback — so the PNG goes
      Photos → Instagram in one tap instead of landing in Files with no route out. An IG Story
      preset (1080×1920) is offered, since Stories is the stated use and a 1:1 export letterboxes.
      Also: `canvas.width = canvas.height = 0` in `exportPng`'s `finally`, so a 34.8 MB A4
      backing store is released instead of waiting for GC.
- [x] **The privacy claim is enforced by the browser, not asserted by the copy.** A
      `connect-src 'none'` CSP meta ships. Verified against a real build: zero violations in
      normal use, PNG and SVG still export, and `fetch` / `XHR` / `sendBeacon` / `img`-pixel are
      all blocked — including PapaParse's dormant `NetworkStreamer` XHR, which is why a two-minute
      devtools check currently gives a **false positive** on the headline claim.
      **Prerequisite, not a footnote:** `sw.js` derives its cache version from the JS hash alone
      (`vite.config.ts:71`), so an `index.html`-only change — which this is — leaves `sw.js`
      byte-identical and never reaches offline users. Hash the whole precache manifest first, or
      this criterion ships to nobody.

## Non-goals / Later / Not now

- NO field/axis mapping or chart-type gallery UI (that is RAWGraphs' turf — we lose if we
  compete there). The single line/bar/scatter override above is an escape hatch, NOT field
  configuration; zero-config stays the default.
- No dashboards, no multi-chart, no data storage, no accounts, no analytics, no AI
- Later: color/theme presets, .xlsx input, editable chart title/labels
- Later (surfaced by the review — see DECISIONS): sort categorical bars by value +
  horizontal bars for long labels; aggregate (sum/count) categorical data instead of
  plotting/sampling raw rows; data labels on bars.

### Found by the 2026-07-16 review (12 reviewers: 6 expert lenses + 6 user personas)

Everything the round found that v1.4 does **not** take. Recorded so none of it is lost.
All were reproduced by an executed run, not by reading.

**v1.5 — accessibility** (the app is not WCAG 2.2 AA today):
- `--faint` #948d7c is 3.0:1 on paper / 3.3:1 on card — fails AA for the small text it is
  used on, including the drop-zone's "click to browse" (the *only* usable hint on touch).
  `--muted` measures 5.2:1 and is fine.
- The chart has no text alternative. Sharper than the usual "canvas needs a label": the
  **title exists only as canvas pixels** — derived from the filename, never written to the
  DOM — so a screen-reader user emails a chart titled "Q3 sales FINAL (2)" never knowing.
- A successful render is silent: focus never moves, `#notes` is not a live region, and
  `#status` is populated *while* `hidden` then unhidden, which frequently never announces.
  A failed export can therefore be completely silent.
- The dropzone is a `<section>` acting as a button → announced as a *region*, i.e. scenery;
  Enter works only by accident and Space is eaten by browse mode.
- `prefers-reduced-motion` is honored nowhere. `withBusy` disables the focused button before
  setting "Rendering…", which blurs it, so that text is unannounceable by construction.

**v1.6 — chart quality, mobile, landing:**
- Palette: series 3 `#6b7f92` and 4 `#a86a5f` are the **same gray** (BT.601 luma 123.2 vs
  123.3) — indistinguishable in B&W print; series 3–6 sit within 11 levels. Only 1–2 survive
  grayscale, and only `borderColor` varies, so there is no redundant encoding. Add a
  `borderDash` ramp. Ochre `#cf8636` is ~2.9:1 on the export background (<3:1).
- Numeric axes have no thousands separator (`1000000`), the biggest readability tax on the
  finance charts that are the core use case.
- Long/many category labels rotate 55° instead of switching to horizontal bars.
- The y-axis title is suppressed exactly when multi-series, so a multi-series revenue chart
  has no unit anywhere.
- Sort categorical bars by value **when x is nominal text** (the guard that answers the
  2026-07-06 objection: months must keep their order). Reverses that decision under a guard.
- The SVG declares no CJK-capable font family, so a Chinese chart opened in Figma loses the
  labels that carry the meaning. **Landmine:** a native name like `微軟正黑體` makes SVG
  export throw — canvas2svg's family regex `([-,"\sa-z]+?)` accepts no CJK codepoints. Use
  ASCII names only (`Microsoft JhengHei`, `PingFang TC`, `Noto Sans CJK TC`).
- Mobile: no `@media` block exists at all; no `navigator.share`, so on iOS the PNG lands in
  Files and Instagram (which reads only the Photo Library) is a dead end; no Stories
  1080×1920 preset; preview axis labels compute to 3–5 CSS px at 390px; the A4 export canvas
  is never released (`canvas.width = 0` in the `finally` frees it); the paste textarea at
  13.6px triggers iOS focus-zoom; in WhatsApp's WKWebView the download is a silent no-op.
- Landing: the page opens on an empty dropzone, hiding the one moat (the output looks
  designed by default). Auto-render a sample on load; lift paste out of `<details>`; re-aim
  the copy at privacy-for-data-you-*won't*-upload (the current "post it" framing nullifies
  the wedge); ship a `connect-src 'none'` CSP meta — tested against the real build: zero
  violations, PNG+SVG still export, and every exfil vector blocked. Full-width digits
  (`１２３`) need NFKC normalization.

**Needs a scope decision before it can be specced** (each edges toward the field-mapping
non-goal, so none is a free "yes"):
- **A numeric column can never be the x axis** (`detect.ts` picks `dates[0] ?? categories[0]
  ?? indexColumn`). Forcing a line onto `dose,response` puts dose on the *row index*: 0.5 µM
  and 10 µM steps drawn the same width (verified in the exported SVG — all gaps 654 px), and
  a saturating curve reads as accelerating. The chart states the opposite of the data.
- **Excel reality**: a merged title row above the header is taken as the header; a `Total`
  row becomes the tallest bar (or silently vanishes, or flips the chart type, depending on
  row count); a wide/transposed P&L — the normal accounting layout — renders confidently
  backwards, with the six-series note blaming column count rather than saying "your file is
  sideways".
- Aggregating repeated categories (already in Later); error bars (probably a hard non-goal).

**Cut from v1.4 by the 2026-07-16 stress test** (kept here with the reason, so nobody re-proposes
them from scratch):
- **Reading `Jan-25` / `114/01/05` / `01/02/2025` correctly** (rather than v1.4's "reject them to
  category"). Needs a real parser plus a both-readings note mechanism mirroring `numberWarning`,
  and — unlike the v1.1 date *adapter*, which was differential-tested against date-fns while it
  was still installed — there is **no oracle**, because diverging from `Date.parse` is the point.
  That adapter still shipped a DST bug the first differential sweep missed. Bare ROC years
  (`民國年,營收` with `112,113,114`) belong here too: they render a scatter today.
- **The `年` / `year` header fix.** Must close both scripts (`last_year_revenue` breaks exactly as
  `去年營收` does), and must not break `年份(西元)`, `年度別`, `會計年度 2025`, `年_2025` — a
  `$`-anchor does. Candidate policy, unverified and not to be shipped unchecked: "`年` must not be
  followed by another CJK character." Residual false positives in every proposal seen so far:
  bare `去年`, `每年`, `last year` — harmless unless the values are 4-digit and in 1900–2099.
- **Currency/percent → numbers** (`45%` → **45**, decided by the user; not 0.45, not the year
  2045). v1.4 only stops these hijacking the time axis. Parsing them must inherit v1.2's
  per-column doctrine, close the symbol list (`$`, `NT$`, `£`, `€`, `¥`, `%`, `元`, leading *and*
  trailing — zh-TW writes `1,234元` as a suffix), and carry the stripped unit into the series
  label. Note the coupling: the y-axis title is suppressed exactly when multi-series, so stripping
  `%` off the value leaves the unit nowhere on the figure — that defect is a **blocker** for this
  item, not a v1.6 nice-to-have.
- **The offline network race.** 3s is right (it is Workbox's own default), but a raw
  `Promise.race` is worse than today: the losing fetch is never aborted *and* its fresh response
  is discarded, so the next load is stale too — Workbox instead lets the lost race refresh the
  cache. Combined with the `sw.js` version bug below, it would pin slow-tail users to an old build
  permanently, with no recovery path. Fix the version derivation first; then race with a
  `waitUntil` cache refresh.

**Infrastructure debt:**
- `event.respondWith(caches.match("./").then(hit => hit || caches.match("./index.html")))`
  (`vite.config.ts:44`) resolves to **`undefined`** when neither is cached — `caches.match`
  resolves undefined on a miss, it does not reject — and `respondWith(undefined)` is a TypeError,
  i.e. a hard network error with no fall-through. Live today, not introduced by any proposal.
- An `index.html`-only change never reaches offline users: `sw.js`'s cache version derives
  from the JS hash alone, so the SW is byte-identical and never re-precaches. (A CSS-only
  change *is* safe — `main.ts` imports the CSS, rotating the JS hash. Undocumented and
  load-bearing.) This bites the moment the CSP meta above ships.
- `skipWaiting()` + `clients.claim()` is safe only because there is exactly one JS chunk;
  the first dynamic `import()` turns it into mid-session 404s.
- `papaparse` floats on `^5.4.1` (installed: 5.5.4) while chart.js and canvas2svg are pinned
  exactly — and papaparse is the dependency that touches user data first.
- CONTRIBUTING is accurate about node-canvas but buries the lede: the scary `apt-get` block
  is visually dominant over the "on Windows/macOS it just works" sentence above it.

### Found by the 2026-07-10 audit (all pre-existing; ranked by how badly they mislead)

1. ~~EU thousands-dot (`3.850`) parses as `3.85` — off by 1000x, silently.~~
   **Fixed in v1.2**: the convention is detected per column, and a column nothing can
   settle renders with a note naming both readings.
2. ~~`2025-01-01` parsed as UTC midnight but drawn on a local-time axis, so anyone west
   of UTC sees "Dec 31".~~ **Fixed in v1.2**: bare calendar dates are local midnight.
3. ~~A 7th numeric column is discarded with no note.~~ **Fixed in v1.3.**
4. ~~The offline claim has nothing behind it — no service worker.~~ **Fixed in v1.3.**
5. ~~SVG export is not byte-reproducible (random `clipPath` ids).~~ **Fixed in v1.3.**
6. ~~A blank header row is eaten, promoting the first data row to the header.~~ **Fixed in v1.3.**
7. ~~The bare-year heuristic is a footgun: a `count` column of `2000, 2010, 2020` becomes a
   time axis.~~ **Fixed in v1.3** — a bare year now needs a temporal-looking header.
8. ~~A raw C0 control char makes the exported SVG unopenable.~~ **Fixed in v1.3.**

## Tech shape

Static single-page app: Vite + vanilla TypeScript + one lean chart library
(Chart.js vs D3 — decide at build time, log the choice in DECISIONS.md).
PapaParse for CSV parsing. GitHub Pages deploy. No backend.
