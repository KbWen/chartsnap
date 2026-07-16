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
      **Must flag** (all three pass unflagged today at 1,000 rows — the guard is worse than the
      SPEC admits): Big5 header + 1,000 ASCII rows; Latin-1 with French names; UTF-16LE+BOM,
      i.e. Excel's "Unicode Text" export.
      **Must stay silent:** valid UTF-8 Chinese with and without BOM; an emoji column; a real
      UTF-8 file carrying one stray bad byte; a valid UTF-8 file truncated mid-character.
      **A flag is a note, never a refusal** (decided 2026-07-16, after the guard was built). The
      detector cannot separate two stray CP1252 bytes in a 5,000-row export from a two-character
      Big5 header — a smart-quote *pair* scores 2, a `年,值` header scores 3, and counts alone
      never will. So the consequence is what has to be safe. Refusing told a user their file
      wasn't UTF-8 when it was, cost them the chart, and offered no override — the most
      destructive act this tool has. As a note the asymmetry inverts: a false positive costs one
      ignorable line, a true positive still gets the message, and the Big5 user gets what they
      actually asked for, which was never a refusal but *a warning* — the original report was
      "a chart renders and `notes` is empty — no warning of any kind." Mojibake is self-
      announcing: `���,�禬` on an axis is not posted by mistake. The note describes the
      *characters*, not the file, so it is true in both cases.
      **Known and accepted:** a Latin-1 file with exactly one accent is *provably* undecidable —
      identical in (repl, valid) to a UTF-8 file with one stray byte — and the stray-byte case
      wins. Re-earns the v1 criterion with a stronger claim than it originally made.

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
- [x] **A time axis is labelled with the data's own dates.** The tick unit follows the data's
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
      **As shipped:** forcing the unit was only half of it, and the half that shows. Chart.js
      still steps ticks from the period *start*, so monthly data dated the 15th, or a month-end
      close, got ticks on the 1st — 0 of 6 on a real point, every value reading a period late,
      on an axis that now looked authoritative. `ticks: { source: "data" }` is what makes a tick
      a date the file has. Measured across monthly-on-the-1st / -15th / month-end, quarter-end,
      weekly, daily and sub-daily, at **every preset**: ticks on data = ticks, in all of them.
      **Asserted as the property** — `tick.value ∈ data` — not as the label's shape. The first
      version of this criterion was tested with `/^[A-Z][a-z]{2} \d{4}$/`, which passes whether
      every tick is on data or none is, on fixtures that only ever used the 1st of the month:
      the one day where period-start ticks coincide with the data. It could not fail.
- [x] **A posted chart is legible at the size it is posted at.** `fontScale` is
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
      **After (as shipped, corrected 2026-07-16):** type scales with the image's **width**, not
      its short edge — the short-edge version is what made landscape the worst case, so the
      earlier wording here described a fix that would not have worked, and was ticked anyway.
      Sized from the *preset* and then scaled by the preview's own factor, so both paths agree:
      computing it from the render width let the ceiling bite on the export and not on the
      preview, and the preview overstated A4's type by **45%**. That is now a tested invariant
      (`title/width` within 2% between preview and export at every preset), not a comment.
      Type and geometry are separate scales: sharing one meant raising type for legibility also
      inflated the dots and rules, which the numbers called fine and the render called chunky.
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

## v1.6 — the output excludes people (drafted 2026-07-16, NOT READY TO BUILD)

The gap is real: a blind person gets nothing from this tool, a black-and-white printer merges
two of six series, and four bits of UI sit below the contrast floor. Those were listed as
"known limits" at the end of v1.5, which was a way of not doing them.

**A first draft of four criteria was written and then audited by a screen-reader user, a WCAG
engineer and a SPEC auditor. All four failed** — and two were the wrong criterion, not the wrong
detail. The draft is in git history; the audit is below, because what it found is worth more than
the draft was. **Nothing here is built. Do not tick anything until it is rewritten.**

### What the audit found (each verified by an executed run)

- **The "B&W printer" criterion cannot deliver its own headline, and is withdrawn.** Its real
  mechanism is a dash ramp — 12 luma levels is 4.7% of the range and a halftone does not keep
  that. But `canvas2svg` has no `setLineDash` (`typeof ctx.setLineDash === "undefined"`), and
  `export.ts:88-96` shims it to stash the array on `__dash` and hand it back — so Chart.js is
  satisfied, `getLineDash()` returns `[6,4]`, nothing throws, and the emitted SVG has **no
  `stroke-dasharray`**: every vector line is solid. The fix would work in the PNG and vanish
  from the format you take to a printer. And `chart.ts:397` sets `borderWidth: 0` on bars, so a
  bar dash is a structural no-op — bars, the most common chart this tool draws, can never carry
  a second channel at all. Delivering the headline needs surgery on an unmaintained library's
  serializer plus a pattern-fill story for bars. That is a release, not a criterion. **Later.**
- **The one colour that provably excludes people is `#cf8636`** — series 2, measured **2.90:1**
  on `EXPORT_BG`, below WCAG 1.4.11's 3:1 for graphical objects. The draft froze it as "the
  signature, does not move". `#ca8233` measures 3.06:1 and is visually indistinguishable. That
  is a real one-hex criterion and it survives, below.
- **A contrast test cannot be computed from CSS in this repo.** Measured on the pinned jsdom
  29.1.1: `getComputedStyle().color` returns the literal `"var(--faint)"`, `font-size` returns
  `"0.82rem"` (so the 4.5-vs-3.0 threshold is unknowable), and an ancestor with
  `background: var(--card)` computes to `rgba(0,0,0,0)` — so "what is behind this text" returns
  nothing, for every node. Even with a perfect CSS parser it stays undecidable: the backdrop is
  a fact about the DOM tree, not the stylesheet. A real test needs a browser engine — a new
  dependency, a CI browser download, a Rule 4 vetting. **That is the decision the criterion
  turns on, and it must be made before the criterion is written, not during.**
- **`--faint` `#948d7c` fails AA** (3.00:1 on paper, 3.27:1 on card) on four things
  (`style.css:117, 279, 404, 414`). The arithmetic nobody had done: AA on `--paper` needs
  L* <= 47.26, and `--muted` sits at L* 43.38 — so **the entire space for a compliant third tier
  is 3.88 L* wide**, where today's step is 15.41. A compliant `--faint` (`#746e61`, 4.61:1) is a
  nudge, not a tier. The three-step hierarchy does not survive a 4.5:1 floor on near-white paper
  via lightness alone; that is arithmetic, not taste. Either move `--muted` down as well
  (`#5e584b`, 6.42:1 — every existing use gains contrast, nothing regresses) or accept two tiers.
  **A decision, not a fix.**
- **`chart.ts` carries a second, different `muted`** — `THEME.muted` `#6f6a5f` (`chart.ts:54`)
  versus CSS `--muted` `#6c6659` (`style.css:6`). Same name, different value. Any test scoped to
  "the stylesheet" validates one and never sees the other — and the chart's ticks, axis titles
  and legend are text, in the artifact, outside the stylesheet.
- **`textContent` cannot assert accessibility.** Measured: a `display:none` table, an
  `aria-hidden="true"` table and a correct visually-hidden table return **identically** from
  `document.body.textContent`. The draft's property — "every value appears in the DOM" — passed
  for both implementations the same criterion forbade. Substring checks false-pass as well: on
  the text "Revenue over 2018-2025", `includes("18")`, `includes("25")` and `includes("5")` are
  all true.
- **`detection.yColumns` excludes `xColumn`** for line and bar: `classify()` (`detect.ts:16-23`)
  filters on disjoint types, so the two sets cannot overlap. A property asserting only
  `yColumns` is satisfied by a table of six unlabelled number columns. Scatter is the reverse —
  `detect.ts:72` puts `xColumn` *inside* `yColumns`. One property, two incompatible meanings.
- **The draft's `#status` "after" state was already true.** `index.html:67` ships the node;
  `hidden` removes it from the *accessibility tree*, not the DOM. The criterion described its own
  before-state. And it named `#notes` while fixing only `#status`: `.notes:empty
  { display: none }` (`style.css:261`) removes `#notes` from the tree exactly when a live region
  needs registering, and `render()` writes it at `main.ts:139` *before* `main.ts:140` unhides its
  ancestor — the identical bug, in the element the criterion named.
- **"Errors announce more loudly than notes" is not a thing.** There is polite and assertive, not
  volume; one node cannot be both, and flipping `role` at runtime races the write. Two permanent
  regions is the known-good pattern. Worse, the clause protected a behaviour that does not work
  today — errors do not announce at all, as this SPEC's own v1.5 review records — so it was a new
  requirement wearing must-keep-working clothes. **Fifth instance of the trap recorded four times
  on 2026-07-16.**

### The rule this draft broke, in its own words

The section header claimed *"every criterion below names what must keep working, its numbers were
produced by running the current code, and each is asserted as a property"*. The numbers were real
— every measurement reproduced exactly. **The assertions were not.** As the audit put it: the
section did the measuring and not the asserting, and "asserted as a property" became vocabulary
applied to four things that are not properties. AGENTS.md gained that rule the same day this draft
was written. **Learning a rule's words is not learning its method** — and the tell is always the
same: the fixture was derived from the change rather than from a run.

### Done criteria (v1.6) — to be rewritten before any code

The audit produced concrete replacements; adopt them rather than redrafting from scratch. The
shape all three reviewers agree on:

- [ ] **The chart's title exists outside the pixels.** Asserted on all three title paths — file
      (scrubbed filename), paste (`autoTitle`), chip (literal) — which differ, so a test that
      hardcodes one goes red on the other two. Must keep working: PNG and SVG bytes unchanged at
      every preset (`png.test.ts` and `reproducibility.test.ts` pin them today).
- [ ] **A screen reader can read the plotted numbers.** A visually-hidden table whose rows are
      built from the same data `buildConfig` hands Chart.js — so scatter's NaN skips
      (`chart.ts:228`), the time-axis sort (`:282`) and dropped rows (`:279`) cannot diverge from
      it — plus a one-sentence summary, because 1,000 rows x 7 columns is 7,000 NVDA keypresses
      and the job is *vouching for a chart before sending it*, not studying data. Asserted
      positionally against those datasets, never with `textContent.includes`. **Negative control
      required:** a test that sets the table `display:none` and expects the assertion to go red.
- [ ] **A render is announceable.** Two permanent live regions, outside anything ever `hidden` or
      `:empty { display: none }`. Asserted as the invariant rather than the speech: at no observed
      moment does a status element satisfy `textContent !== "" && (hidden || display === "none")`
      — checkable in jsdom, and **it goes red against today's code**. The word "announces" is
      earned by one NVDA and one VoiceOver pass recorded in LAUNCH.md, never by a green suite.
- [ ] **Series 2 clears the graphical-object floor.** `#cf8636` measures 2.903:1 on `EXPORT_BG`,
      failing WCAG 1.4.11's 3:1 for graphical objects. `#ca8233` is 3.059:1 and **ΔE00 1.37** from
      the original — below the JND, with no original alongside to compare against. The "signature
      does not move" objection does not survive the measurement: it moves by an amount nobody can
      see, and the alternative is shipping the one colour in the output that provably excludes
      people. Must keep working: `reproducibility.test.ts` stays green.
- [ ] **No two series are the same colour to a colourblind reader.** This is the live defect and
      it is not in dispute: series 3 `#6b7f92` and series 5 `#8a8199` measure **ΔE00 2.24 under
      protanopia** (Machado 2009, severity 1.0, in linear RGB) — at the JND, i.e. the same
      colour, for ~8% of men, on screen, in colour, today. No printer required, and no criterion
      has ever mentioned CVD. **It does not need the series cap cut:** a 6-colour palette keeping
      `#155e4c`, staying inside the design language (L* >= 24, chroma <= 60), reaching min CVD
      ΔE00 **20.83** and all >=3.01:1 was found and verified. Asserted as a property over
      `PALETTE` itself: min pairwise ΔE00 >= 15 after simulating deuteranopia **and**
      protanopia — a separate axis from grayscale, not a consequence of it (`#506277`/`#026e76`
      are ΔY'601 16.4 apart and ΔE00 **0.1** for a deuteranope; `#87697c`/`#8e7431` are ΔE00 26.5
      for a deuteranope and ΔY'601 **0.0**).

- [ ] **Grayscale: a decision, not a criterion — three doors, and the SPEC must pick one.**
      A first draft claimed six series was *arithmetically impossible* and cut `MAX_SERIES` to 4.
      **That claim is false**, and a Tenth Man broke it with a counterexample since verified:
      `["#155e4c","#4c1102","#2a0017","#1e3681","#ac7ab4","#148133"]` — six colours, min pairwise
      **ΔL* 10.08**, min CVD ΔE00 18.99, min contrast **3.33:1**, signature untouched. Every
      stated constraint, satisfied, at six.
      The proof had two premises. WCAG 1.4.11 supplies the *ceiling* (L* <= 61.16 for 3:1 on
      `EXPORT_BG`) and that is real. The *floor* — "around L* 25" — is cited to nothing: 1.4.11
      sets no maximum contrast, so it cannot supply one, and the floor was doing 100% of the
      impossibility work. It is also the conclusion restated as a premise: `#155e4c` sits at
      L* 35.37, and a ΔL*=10 grid anchored there under a 61.16 ceiling puts n=4's floor at
      **L* 25.37** — the asserted number, to 0.4. Three cracks confirm it: the draft's own
      `#343463` is **L* 23.96, below its own floor**; `THEME.ink` `#1c1a15` is **L* 9.32**, so
      the tool already titles its charts darker than any series a 6-palette needs; and "4 gives
      12.05, satisfiable with margin" is wrong — the shipped 4-palette's worst pair is
      **ΔL* 10.01** against a threshold of 10.
      **What is actually binding is `chart.ts:45-46`** — *"the rest are muted on purpose so they
      sit back instead of fighting for attention"*. That is design language: legitimate,
      load-bearing, the thing the 2026-07-05 and 07-06 passes built. But encoding it as an
      unstated L* floor and calling the result *impossible* converts a preference into a proof.
      **The honest statement: series colours must be muted mid-tones, so six cannot be told apart
      in grayscale, and something must give.** Three doors, and this SPEC must walk through one
      of them *in writing* rather than let an undefended constant choose:
      1. **The design language** — allow a series darker than L* 25 (the tool's own ink is 9.32),
         and six becomes reachable. Costs the "muted support colours" identity.
      2. **The grayscale criterion** — concede it, and say so in the README, which already
         documents limits honestly ("It charts rows as they are — it doesn't sum or group them").
         Note this is the weakest of the three constraints: only **A4** has a defined physical
         size (`export.ts:6-14`); the other three presets are screen/social, the tool's headline
         is "a chart you can post", and the draft itself conceded that at the Twitter card gray
         is not a channel at all. The B&W-printer item was withdrawn to Later the same day.
      3. **The cap** — cut it. But cut it knowing the cost, which the draft mispriced:
         - It costs **all three users this SPEC names** (`SPEC.md` "Who is it for"). Run against
           the real `detectChart`: *survey results* (a 5-point Likert — the canonical survey
           shape) loses `strongly_disagree`; *a workout log* (5 lifts) loses one; *sales numbers*
           (5 regions) loses one. A cap of 4 renders a Likert scale **missing one end** — not
           merely lossy, but flattering.
         - **The note does not travel.** `droppedSeries` appears in `detect.ts` (3x) and
           `main.ts` (1x) and **zero times in `chart.ts` or `export.ts`**, while `chart.ts:130`
           calls itself *"the single source of truth for every render target (preview, PNG,
           SVG)"*. The warning naming the dropped columns cannot reach the exported PNG or SVG.
           It protects the person at the keyboard, not the person who receives the chart — and
           the chart is the product. Any cap decision leaning on that note leans on nothing.
         - **5 was never costed.** The draft jumped 6 -> 4 because 5 scores ΔL* 9.04 *at the
           undefended floor of 25*. At a floor of 20 it scores 10.29 and passes, and a 5-colour
           palette exists at floor 15 (ΔL* 10.05, CVD ΔE00 19.00, all >=3.01:1) — satisfying the
           criterion at a cost of zero to all three named users.
      **Prerequisite whichever door is taken:** `MAX_SERIES` (`detect.ts:6`) and `PALETTE.length`
      (`chart.ts:47`) are both 6 **by coincidence**, in two files, with nothing binding them —
      and `chart.ts:283/345/391` index `PALETTE[i % PALETTE.length]`, which wraps silently. Today
      the coincidence is the only thing preventing two series from being drawn in the same
      colour. Bind them, or a forker who raises the cap ships the exact silent-wrong-chart this
      repo exists to prevent.

**Prerequisite for the whole section:** the dropzone is a `<section>` with an accessible name
(`index.html:34-39`), i.e. a *region landmark*, announced as scenery — and `<input id="file"
hidden>` is not focusable, so a screen-reader user's only route to their own CSV is the paste box.
Making the output readable for someone who cannot open the input is the theme contradicting
itself. It is one line: `<button type="button">`, after which the Enter/Space shim at
`main.ts:216-221` deletes itself. Note `role="button"` takes presentational children, so
`.drop-sub`'s paste hint must fold into the accessible name.

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
