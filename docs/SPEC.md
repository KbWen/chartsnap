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

## v1.5.1 — one hex (decided 2026-07-16)

The only thing a four-expert panel agreed on without qualification, pulled out of the v1.6 draft
that the same panel took apart. It depends on none of v1.6's open decisions — not the series cap,
not the grayscale question, not the palette's identity. It is a shipped WCAG failure and a fix
nobody can see.

### Done criteria (v1.5.1)

- [x] **Series 2 clears the graphical-object floor.** `#cf8636` measures **2.903:1** on
      `EXPORT_BG` `#fffdf8` — below WCAG 1.4.11's 3:1 for graphical objects, i.e. the one colour
      in chartsnap's output that provably excludes people. It is now `#ca8233`: **3.059:1**,
      **ΔE00 1.37** from the original, hue held to 0.1° (68.0° → 67.9°) and chroma to 0.5
      (56.7 → 56.2). Only lightness moves, by 1.6 L*. The "signature does not move" objection
      does not survive the measurement — it moves by an amount nobody can see, with no original
      alongside to compare against.
      **Not `#cb8335`, which this SPEC drafted, and not `#cc8333`.** Both are nominally legal
      (3.021:1, 3.011:1) and both **drop below 3:1 under a single 8-bit rounding step** — margins
      of 0.7% and 0.35%, thinner than the quantisation grid they ship on. `#ca8233` holds ≥3:1
      across its whole ±1 neighbourhood (3.022–3.097). Choosing between two moves nobody can see,
      take the one that survives rounding.
      **Must keep working** (run before the change): `#155e4c` does not move; no test pins the
      ochre hex (`grep` — it lives only at `chart.ts:47`), so nothing was written to the change's
      shape; `reproducibility.test.ts` and `png.test.ts` stay green, and the SVG smoke test still
      finds real geometry.
      **Asserted as a property:** every entry in `PALETTE` clears 3:1 against `EXPORT_BG`,
      computed from the values themselves — so a colour cannot be added below the floor later.
      Verified by rendering and looking, not only by arithmetic.

- [x] **The series cap and the palette cannot drift apart.** `MAX_SERIES = 6` lives in
      `detect.ts:6`; `PALETTE.length` is 6 in `chart.ts:60`. Two files, **equal by coincidence**,
      with nothing binding them — while `chart.ts` indexes `PALETTE[i % PALETTE.length]` in three
      places, which wraps **silently**. Today that coincidence is the only thing standing between
      this tool and two series drawn in the same colour. Raise the cap to 8 and series 7–8 repeat
      colours 1–2: the exact silent-wrong-chart this repo exists to prevent, shipped to whoever
      forks it. Found by the same panel, after v1.5.1's first criterion had already shipped.
      **Asserted as a property:** `MAX_SERIES === PALETTE.length`. One line, and it goes red the
      moment either moves without the other — which is the point, because the next person to
      touch either number will be reading the code, not this SPEC.
      **Must keep working:** nothing changes at runtime today; the two numbers are already equal.
## v1.5.2 — CVD safety & supply-chain pinning (decided 2026-09-28)

Resolves the live defect identified in the v1.6 audit where series 3 and 5 are identical to a protanope, picks Door 2 for grayscale, and pins the floating PapaParse dependency.

### Done criteria (v1.5.2)

- [x] **No two series are the same colour to a colourblind reader.** Series 3 `#6b7f92` and series 5 `#8a8199` measure **ΔE00 2.24 under protanopia** (Machado 2009, severity 1.0, in linear RGB) — at the JND, i.e. the same colour, for ~8% of men, on screen, in colour. Replace the palette with verified hexes keeping the brand lead `#155e4c` and ochre `#ca8233`, where all 6 series achieve min pairwise CVD ΔE00 ≥ 15 (measured ≥ 17.7 on protanopia and ≥ 18.0 on deuteranopia, and ≥ 27.1 in standard vision).
- [x] **All series colours clear WCAG 1.4.11 with neighbourhood rounding safety.** Every entry in `PALETTE` clears 3:1 against `EXPORT_BG` (`#fffdf8`) across its whole ±1 8-bit rounding neighbourhood.
- [x] **Grayscale honest limitation documented (Door 2).** As decided in DECISIONS.md (Door 2), acknowledge that on social screen presets (Twitter card, IG) monochrome gray is not an effective channel without breaking the muted editorial design language. Document this honestly in `README.md` under "What it isn't / Known limitations".
- [x] **Supply-chain pinning.** Pin `papaparse` from `^5.4.1` to exact installed version `5.5.4` in `package.json`, matching `chart.js` and `canvas2svg` exact pinning.
- [x] **Tripwire property assertion.** `test/palette.test.ts` asserts:
      (1) Every colour in `PALETTE` has contrast ≥ 3:1 against `EXPORT_BG` and survives ±1 neighbourhood quantization.
      (2) `PALETTE[0] === "#155e4c"` (signature unchanged).
      (3) `PALETTE.length === MAX_SERIES` (cap tripwire).
      (4) Machado 2009 CVD simulation: for both protanopia and deuteranopia at severity 1.0, minimum pairwise CIEDE2000 ΔE00 ≥ 15.0 across all 15 pairs. Proven to fail (red) against the old palette before passing (green).
- [x] **Must keep working:** All 245 tests pass (+7 tests); PNG and SVG exports remain byte-deterministic; no regression on existing presets.

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

#### Done criteria (v1.6) — completed 2026-09-28

(Note: CVD safety and the Grayscale Door 2 decision were completed and shipped in v1.5.2.)

- [x] **The chart's title exists outside the pixels.** The chart title is rendered into the DOM as an accessible heading (`#chart-title`), not only as canvas pixels. Asserted on all three title paths — file (scrubbed filename), paste (`autoTitle`), chip (literal) — which differ, so a test that hardcodes one goes red on the other two. Must keep working: PNG and SVG bytes unchanged at every preset (`png.test.ts` and `reproducibility.test.ts` pin them today).
- [x] **A screen reader can read the plotted numbers.** A visually-hidden table (`#sr-table`) is rendered in the DOM whose rows are built from the same data `buildConfig` hands Chart.js — so scatter's NaN skips (`chart.ts:238`), the time-axis sort (`:295`) and dropped rows cannot diverge from it — plus a one-sentence summary, because 1,000 rows x 7 columns is 7,000 NVDA keypresses and the job is *vouching for a chart before sending it*, not studying data. Asserted positionally against those datasets, never with `textContent.includes`. **Negative control required:** a test that sets the table `display:none` or `aria-hidden="true"` and expects the assertion to go red.
- [x] **A render is announceable.** Two permanent live regions, outside anything ever `hidden` or `:empty { display: none }`. Asserted as the invariant rather than the speech: at no observed moment does an active status/notes element satisfy `textContent !== ""` && (hidden || display === "none")` — checkable in jsdom, and **it goes red against today's code**. The word "announces" is earned by one NVDA and one VoiceOver pass recorded in LAUNCH.md, never by a green suite.
- [x] **Dropzone is accessible.** The dropzone is interactive as a button (`<button type="button" id="drop" class="dropzone">`), properly exposed to the accessibility tree with an accessible name, natively focusable via keyboard, and triggering file selection on Enter or Space without requiring extra JS keydown shims.
- [x] **Must keep working:** All 245 existing tests pass (+12 a11y tests, 257 total); no regression on exports or presets.

**Prerequisite for the whole section:** the dropzone is a `<section>` with an accessible name
(`index.html:34-39`), i.e. a *region landmark*, announced as scenery — and `<input id="file"
hidden>` is not focusable, so a screen-reader user's only route to their own CSV is the paste box.
Making the output readable for someone who cannot open the input is the theme contradicting
itself. It is one line: `<button type="button">`, after which the Enter/Space shim at
`main.ts:216-221` deletes itself. Note `role="button"` takes presentational children, so
`.drop-sub`'s paste hint must fold into the accessible name.

## v1.7 — edge robustness, CJK vector fidelity & polish (decided 2026-09-28)

Addresses the gaps identified in the multi-angle audit: CJK fonts missing in SVG exports for Figma/vector tools, full-width digits crashing number detection, locale non-determinism in Chart.js, service worker navigate fallback TypeError, and prefers-reduced-motion.

### Done criteria (v1.7) — completed 2026-09-28

- [x] **CJK fonts in SVG export without canvas2svg crash.** The SVG export font stack includes ASCII names for CJK fonts (`PingFang TC`, `Microsoft JhengHei`, `Noto Sans CJK TC`) alongside system-ui stack so that Chinese text renders faithfully in Figma/Illustrator. canvas2svg must not crash (ASCII-only names, no non-ASCII names like `微軟正黑體` that break `canvas2svg`'s `__parseFont`). Asserted in test.
- [x] **Full-width digits normalized (NFKC).** Full-width numbers (e.g. `１２３`, `４５.６`, `２０２５-０１-０５`) in cells or headers parse and detect as numbers/dates without dropping to category strings or failing with "No numeric column found". Asserted positionally on full-width input.
- [x] **Chart.js locale determinism.** Chart.js configuration specifies `locale: "en-US"`, ensuring thousand-separators and numeric tick formatting are deterministic across different OS/browser locales.
- [x] **Service worker navigate fallback resilience.** On offline cache miss, the service worker navigation fallback never passes a Promise resolving to `undefined` into `event.respondWith()`.
- [x] **Respect `prefers-reduced-motion`.** The stylesheet includes a `@media (prefers-reduced-motion: reduce)` block that turns off animations and transitions when the user requests reduced motion.
- [x] **Must keep working:** All 257 existing tests pass (+7 v1.7 tests, 264 total); no regression on exports or presets.

## v1.8 — interaction polish, WCAG AA contrast & focus integrity (decided 2026-10-07)

Resolves live friction points audited by roundtable & tenth-man: spreadsheet clipboard paste support (TSV/semicolon with delimiter-guess trailing newline guard), --faint & --muted contrast upgrade preserving 3-tier visual hierarchy to WCAG 2.1 AA (>= 4.5:1), explicit high-contrast :focus-visible styles, and mobile theme-color meta tag.

### Done criteria (v1.8) — completed 2026-10-07

- [x] **Spreadsheet clipboard paste works anywhere on the page without false triggers.** Global paste handler detects multi-line tabular text with newlines (`\n`/`\r`) and delimiters (`\t`, `,`, `;`), charting instantly. `parseCsv` handles trailing newlines gracefully so PapaParse delimiter guessing for 2-column TSV never falls below the 1.99 threshold. Single-line text pastes with stray delimiters stay inert and do not destroy the current chart.
- [x] **`--faint` and `--muted` clear WCAG 2.1 AA while preserving 3-tier hierarchy.** `--faint` adjusts to `#746e61` (4.61:1 on paper, L* 46.6) and `--muted` adjusts to `#5e584b` (6.42:1 on paper, L* 37.6), holding a Delta L* of ~9.0 between secondary and tertiary text while both clear the 4.5:1 AA floor. `chart.ts`'s `THEME.muted` stays untouched so export byte-determinism is preserved.
- [x] **High-contrast keyboard focus indicators (`:focus-visible`).** `.btn` defines explicit outline (`outline: 2px solid var(--accent); outline-offset: 1px;`), and `.dropzone:focus-visible` defines `outline: 2px solid var(--accent); outline-offset: 2px;` (no more `outline: none`), achieving >= 7.5:1 focus contrast against paper.
- [x] **Mobile theme-color meta tag.** `index.html` includes `<meta name="theme-color" content="#f6f4ee" />` matching the paper background for seamless mobile chrome appearance.
- [x] **Must keep working:** All 264 existing tests pass (+10 v1.8 tests, 274 total); PNG and SVG exports remain byte-deterministic; zero CSP violations.

## v1.9 — de-AI business themes, responsive SVG viewBox & color-scheme protection (completed 2026-10-07)

Introduces three strictly de-AI, context-anchored visual themes for distinct business settings (Editorial warm paper, Corporate Slate clean white, Nordic Minimal crisp zinc), adds SVG viewBox for responsive vector embedding, shields color rendering with color-scheme meta, and implements an extensible theme registry ("不要寫死").

### Done criteria (v1.9)

- [x] **Restrained de-AI theme selector.** A minimalist hairline pill group (`palette: [editorial] [corporate] [nordic]`) mirrors the chart-type toggle with zero flashy novelty controls, zero gradients, and zero AI marketing jargon. Default stays `editorial`. Dynamically syncs with `listThemes()` so adding new themes requires zero UI rework.
- [x] **Curated, context-grounded business palettes.**
      (1) `editorial` (default): warm paper `#fffdf8`, ink `#1c1a15`, pine `#155e4c` lead, Economist/FT publication feel.
      (2) `corporate`: pure white `#ffffff`, slate ink `#0f172a`, classic navy `#0f4c81` lead, boardroom/investor pitch deck feel.
      (3) `nordic`: crisp zinc `#fafaf9`, zinc ink `#18181b`, pitch charcoal `#18181b` lead, Linear/Notion modern engineering & analytics feel.
- [x] **Mathematical CVD safety & WCAG contrast asserted for all themes.** Every theme's 6-color palette clears WCAG graphical contrast >= 3:1 against its background across +-1 8-bit rounding neighbourhood, and achieves minimum pairwise Machado 2009 CVD Delta E00 >= 15.0 under both protanopia and deuteranopia across all 15 pairs. Ink clears AAA (>= 7:1) and muted clears AA (>= 4.5:1).
- [x] **Theme synchronizes across preview and exports.** Switching theme updates the live canvas preview, SVG export (including background rect, ink, and gridline colors), and PNG export without altering layout geometry or font ratios.
- [x] **Exported SVG declares responsive `viewBox`.** SVG export injects `viewBox="0 0 width height"`, enabling responsive vector scaling without boundary clipping in web pages, Figma, and slide decks.
- [x] **Browser auto-inversion shield (`color-scheme: light`).** `index.html` includes `<meta name="color-scheme" content="light" />` to prevent mobile browsers from corrupting paper/corporate palettes in forced dark mode.
- [x] **Must keep working:** All 274 existing tests pass (+49 v1.9 tests, 323 total); default `editorial` exports remain byte-deterministic; zero CSP violations.

## v1.9.1 — zero-trust hardening, prototype pollution & XSS defense (completed 2026-10-07)

Hardened through untrusted and adversarial audit: eliminates prototype chain confusion and prototype pollution in the theme registry, sanitizes vector SVG injections, adds dual-layer color-scheme protection, and introduces negative control tripwires and Tritanopia CVD verification.

### Done criteria (v1.9.1)

- [x] **Prototype pollution & prototype chain confusion defense in theme registry.** `getTheme` guards theme ID lookup using `Object.prototype.hasOwnProperty.call(THEMES, id)` to prevent prototype chain confusion (`constructor`, `toString`). `registerTheme` explicitly rejects dangerous prototype pollution keys (`__proto__`, `constructor`, `prototype`) and enforces `SAFE_COLOR_RE` color validation on all background, ink, grid, and palette fields.
- [x] **SVG XSS & injection sanitization.** `theme.bg` in `renderSvgString` strips quotes, angle brackets, and ampersands (`replace(/["<>&]/g, "")`) and preset coordinates are rounded to prevent malformed XML injections or vector breakout.
- [x] **Dual-layer `color-scheme` defense-in-depth.** In addition to `<meta name="color-scheme" content="light">` in `index.html`, `:root` in `src/style.css` declares `color-scheme: light;` to shield against forced dark mode background inversion in mobile browsers and embedded webviews.
- [x] **Adversarial test suite with negative controls & Machado 2009 Tritanopia verification.** 28 zero-trust tests in `test/zero-trust.test.ts` assert prototype pollution resilience, theme immutability, and negative controls proving CVD/WCAG tripwires turn red on invalid palettes, plus verification of Tritanopia min pairwise $\Delta E00 \ge 9.0$ (~4× JND) across all themes.

## v1.10 — common real-world CSV & interaction resilience (completed 2026-10-12)

Addresses common failure modes confirmed by PM panel review: currency/percentage formatting in tables, accounting negative numbers, standard missing value indicators, title rows above headers, ticker symbol defense, global drag-and-drop shield, and dropzone event bubbling.

### Done criteria (v1.10)

- [x] **Currency, percentage & accounting negative parsing:**
      - Strips standard leading currency symbols (`$`, `NT$`, `NT`, `US$`, `USD`, `€`, `EUR`, `£`, `GBP`, `¥`, `JPY`, `RMB`) and trailing unit markers (`%`, `元`, `NTD`, `USD`) without failing numeric detection.
      - Suffix `%` preserves face value (`45%` → `45`, not `0.45` or year `2045`).
      - Preserves extracted currency/percentage unit in the series label or axis title without duplicating existing header units (e.g. `Revenue ($)` does not become `Revenue ($) ($)`).
      - Multi-series charts with conflicting units (e.g. `$` and `%`) append a note explaining the unit discrepancy while labelling series distinctly.
      - Supports accounting negative format (`(500)` or `(1,234.56)` → `-500` or `-1234.56`).
      - Tenth-Man guard: Ticker symbols with leading `$` (e.g. `$AAPL`, `$TSLA`) are never treated as numbers because the remainder (`AAPL`) is non-numeric, keeping ticker columns as categories.
- [x] **Missing value indicators tolerance:**
      - Standard missing indicators (`N/A`, `NA`, `n/a`, `na`, `-`, `—`, `null`, `None`) are recognized as missing values rather than invalid category strings, allowing short tables with missing entries (e.g. 2 out of 3 rows numeric) to pass numeric column classification without dropping to text.
      - A column containing only missing value indicators classifies as empty, not numeric.
- [x] **Single title row above header detection:**
      - When row 0 consists of a single title string (1 non-empty cell) while row 1 has multiple columns, row 0 is adopted as the chart title and row 1 is recognized as the column header.
- [x] **Global drag-and-drop shield:**
      - `window`/`document` prevents default dragover/drop navigation so dropping a CSV outside the dropzone box never navigates away from the web app, and files dropped anywhere on the window are handled.
- [x] **Dropzone button semantics & DOM fix:**
      - Hidden `<input type="file">` is placed outside `<button id="drop">`, eliminating invalid nested interactive content and preventing click event bubbling re-entrancy.
- [x] **Result scroll feedback:**
      - Rendering a chart from file upload or textarea paste smoothly scrolls the chart into view on small screens.
- [x] **Must keep working:**
      - All 431 existing tests pass (+11 v1.10 tests, 442 total); no regression on existing presets, exports, themes, or detection branches; zero CSP violations.

## v1.10.1 — drop event deduplication & currency-first accounting negatives (decided 2026-10-15)

Remediates the Tenth-Man adversarial audit findings: (1) event bubbling on `#drop` triggering double-processing of dropped CSV files; (2) accounting currency strings where currency symbol precedes the parentheses (e.g. `$(500)` or `NT$(1,234.56)`).

### Done criteria (v1.10.1)

- [x] **Dropzone drop event deduplication:**
      - Dropping a CSV onto `#drop` calls `e.stopPropagation()`, ensuring `handleFile` is invoked exactly once and not re-triggered by the global `window` drop listener.
- [x] **Currency-first accounting negatives (`$(500)`):**
      - `cleanNumberString` handles accounting negative parentheses both outside (`($500)`) and inside (`$(500)` or `NT$(1,234.56)`) the currency prefix. Returns `cleaned: "-500"` and extracted `unit: "$"`.
      - Stock ticker defense holds: `$AAPL` and `$(AAPL)` remain categories, never treated as numbers.
- [x] **Must keep working:**
      - All 442 existing tests pass (+6 v1.10.1 tests, 448 total); PNG and SVG exports remain byte-deterministic; zero CSP violations.

## v1.10.2 — Tenth-Man audit remediation: header survival, pure notes, date-note guard, parser & test integrity (shipped 2026-10-16)

Remediates all P0/P1/P2 defects uncovered and verified by executed runs in the 2026-10-16 adversarial audit:

### Done criteria (v1.10.2)

- [x] **Partially blank header rows survive (`",votes\nApples,30..."` and `"item,\nApples,30..."`).**
      - Fix `parseCsv`'s single-cell title row detector so a multi-column header with only one named column (such as pandas `df.to_csv()` / R `write.csv()` unnamed index column `,votes` or unnamed value column `item,`) is never mistaken for a report title.
      - Specifically, row 0 is only extracted as `extractedTitle` when `rows.length >= 3`, the single non-empty cell is at column 0 (`rows[0][0].trim() !== ""`), and either `rows[0].length === 1` (un-delimited title line) or `rows[1]` consists entirely of non-numeric header strings (`rows[1].every(c => c.trim() === "" || Number.isNaN(toNumber(c, "us")))`).
      - **Must keep working:** `"Annual Sales Report 2025\nYear,Revenue\n2023,100"` and Excel merged title rows `"Annual Sales Report 2025,\nYear,Revenue\n2023,100"` still extract `extractedTitle: "Annual Sales Report 2025"` and use `Year, Revenue` as headers; `",\n1,2\n3,4"` still becomes `Column 1, Column 2`.

- [x] **Mixed-unit warning is side-effect-free, shown on initial UI render, and never fires on scatter plots.**
      - Remove `parsed.notes.push(mixedNote)` from `buildConfig` (`src/chart.ts`), restoring strict immutability of `ParsedCsv` and `parsed.notes` across renders (`Object.freeze(parsed.notes)` on a multi-unit CSV must not throw).
      - Compute the mixed-unit warning for shared-axis multi-series charts (`detection.type !== "scatter" && detection.yColumns.length > 1`) via pure `mixedUnitsNote` / `collectNotes` (`src/a11y.ts`) and surface it in `showNotes` (`src/main.ts`) so `#notes` displays the warning immediately on the first `render()`, not only after a subsequent re-render.
      - **Must keep working:** Scatter plots with different X and Y units (e.g. `Spend ($)` vs `ROI (%)`) do NOT emit a "mixed units on the same axis" warning, because scatter plots them on two orthogonal axes.

- [x] **`unreadDateNote` never false-triggers on ordinary category labels (`Store 1`, `Item 2`, `Week 4`).**
      - Gate `unreadDateNote` (`src/csv.ts`) with a structural date-shape pre-check before calling V8's `Date.parse`: a cell is only considered a "refused date" if it contains date-like numeric separators (`/\d\s*[/. -]\s*\d\s*[/. -]\s*\d/`) or a recognized month token (`MONTH_NAME`) alongside digits.
      - **Must flag:** `01/02/2025`, `1/5/2025`, `Jan-25`, `114/01/05`.
      - **Must stay silent:** `Store 1, Store 2, Store 3`, `Item 1..3`, `Phase 1..3`, `Week 1..4`, `Model 3`.

- [x] **Chart-type override (`setChartType`) preserves explicit titles (`sourceTitle` and `extractedTitle`).**
      - Keep `sourceTitle` in `main.ts` state and resolve titles via `resolveTitle(detection, parsed, sourceTitle)` (`src/a11y.ts`) so clicking the `line` / `bar` / `scatter` override toggle keeps the file title, sample chip title, or `parsed.extractedTitle`, falling back to `autoTitle(detection)` only when the chart title was auto-generated (e.g. raw pasted CSV without a title row).

- [x] **Number/currency edge cases, token-aware unit deduplication, scatter a11y units, and `registerTheme` bounds:**
      - `cleanNumberString` (`src/csv.ts`): support leading `NTD` before `NT` (`"NTD 1,200"` → `{ cleaned: "1,200", unit: "NTD" }`), support leading `+` before currency (`"+$500"` → `{ cleaned: "500", unit: "$" }`), and reject double signs (`"--500"`, `"+-500"`, `"-+500"`, `"(-500)"`, `"(+500)"`) so they are not parsed as numbers.
      - `formatTitleWithUnit` (`src/a11y.ts`, re-exported by `src/chart.ts`): match alphabetic units (`NT`, `USD`, `EUR`, `NTD`) on case-insensitive word/non-letter boundaries instead of bare `.includes()`, so `"Amount"` + `"NT"` becomes `"Amount (NT)"` while `"Revenue (usd)"` + `"USD"` is not duplicated.
      - `src/a11y.ts`: format scatter X and Y headers in `populateSrTable` and column names in `buildSrSummary` using `formatTitleWithUnit`, matching the visual chart axes.
      - `registerTheme` (`src/themes.ts`): require `theme.palette.length >= MAX_SERIES` (6) and restrict hex colors in `SAFE_COLOR_RE` to valid 3, 4, 6, or 8 hex digits.

- [x] **Real behavioural tests replace tautological mocks, and `npm test` never dirty-writes `docs/*.png`:**
      - Replace inline mock listeners in `test/a11y.test.ts`, `test/v18.test.ts`, and `test/v1101.test.ts` with tests that execute the real application logic (`bindDropzoneEvents`, `isTabularPaste`, `resolveTitle`, `collectNotes`), paired with negative controls.
      - Gate disk writes in `test/generate-assets.test.ts` behind `process.env.GENERATE_ASSETS === "1"` (while adding real `expect()` assertions on the rendered PNG buffers and palette hex captions during tests), restore `docs/hero.png` to the weekly commits dataset described by `README.md:11` and `SPEC.md:282`, and fix the palette hex captions in `docs/themes-preview.png` to match `THEMES.corporate.palette` and `THEMES.nordic.palette`.
      - **Must keep working:** All 468 tests across 22 suites pass; `npm run build` succeeds; PNG and SVG exports remain byte-deterministic; zero CSP violations.

## v1.11 — multi-persona real-world resilience (shipped 2026-10-21)

Addresses the 6 persona-driven gaps uncovered by executed runs across European analysts, data analysts with missing values, Excel pivot/report exporters, zh-TW business users, and keyboard/screen-reader users:

### Done criteria (v1.11)

- [x] **Trailing currency symbols & CJK monetary suffixes in `cleanNumberString` (`src/csv.ts`).**
      - Expand `UNIT_SUFFIX` to recognize trailing currencies (`€`, `EUR`, `£`, `GBP`, `¥`, `JPY`, `RMB`, `NT$`, `NTD`, `NT`, `US$`, `USD`, `$`) and CJK currency/magnitude units (`億元`, `萬元`, `千元`, `元`) in addition to `%`, including inside or alongside accounting negatives (`-120 €`, `(80 €)`, `50萬元`).
      - When a single column mixes distinct CJK magnitude units (e.g. `50萬元` and `800千元` in the same column), emit a note warning that mixed units in the column were read at face value.
      - **Must keep working:** Stock ticker guard (`$AAPL`, `$(AAPL)`), ordinary prefixes (`$100`, `NT$500`), and double-sign rejections (`--500`, `(-500)`) remain intact.

- [x] **Title-row vs. partially-blank header disambiguation across EU decimals, `N/A` cells, and year-column pivot headers (`src/csv.ts`).**
      - When `rows[0]` has multiple cells (`rows[0].length > 1`) and 1 non-empty cell at column 0:
        1. Reject title extraction if any cell in `rows[1]` is a missing-value placeholder (`isMissingValue(c)`, e.g. `N/A`, `-`, `null`, `""`) — so `"item,\nApples,N/A\nPears,45"` preserves `["item", "Column 2"]` and all 3 data rows.
        2. Check both `"us"` and `"eu"` number parsing (`!Number.isNaN(toNumber(c, "us")) || !Number.isNaN(toNumber(c, "eu"))`) when testing whether `rows[1]` contains data numbers — so `"item;\nApples;12,5\nPears;15,2"` preserves `["item", "Column 2"]` and all data rows.
        3. Allow `rows[1]` to be recognized as a pivot header row when `rows[1].length >= 3`, all cells in `rows[1]` are non-missing, `rows[1][0]` is non-numeric text, and the remaining cells in `rows[1]` are bare 4-digit years (`1900–2099`) while `rows[2]` contains data — so `"2025 Regional Sales,,,\nRegion,2023,2024,2025\nNorth,100,120,150\nSouth,80,90,110"` extracts `extractedTitle: "2025 Regional Sales"` and uses `["Region", "2023", "2024", "2025"]` as headers.
      - **Must keep working:** `",votes\nApples,30..."`, `"item,\nApples,30..."`, `"Annual Sales Report 2025\nYear,Revenue..."`, and `"Annual Sales Report 2025,\nYear,Revenue..."` all continue to pass.

- [x] **In-sheet `extractedTitle` takes priority over generic filename when present (`src/a11y.ts`).**
      - Update `resolveTitle(detection, parsed, sourceTitle)` so an explicit single-cell report title extracted from row 0 of the CSV (`parsed.extractedTitle`) takes priority over `sourceTitle` (the filename `Book1` / `export`), while `sourceTitle` still beats `autoTitle(detection)` whenever the CSV has no `extractedTitle`.
      - **Must keep working:** Sample chips (`Monthly sales`, `Fruit votes`, `Height vs weight`), normal file uploads without a title row (`q3_quarterly_report.csv`), and chart-type overrides (`setChartType`) keep their expected titles.

- [x] **`YEAR_HEADER` precision across Chinese and English (`src/csv.ts`).**
      - Replace the bare substring `/年/` and loose English `YEAR_HEADER` match with `isYearHeader(name)` so metric columns that happen to contain `年` or `year` (`去年營收`, `今年營收`, `明年預估`, `年營收`, `年終獎金`, `年齡`, `年資`, `年增率`, `last_year_revenue`, `this_year_sales`, `year_end_bonus`, `3-yr-avg`, `Year over Year %`, `last_year`, `this year`) are NOT classified as bare-year date axes when their values happen to sit in `1900–2099`.
      - **Must keep working:** `year`, `Year`, `yr`, `years`, `fiscal_year`, `calendar year`, `birth_year`, `model-year`, `Year (AD)`, `年`, `年份`, `年度`, `年份(西元)`, `年度別`, `會計年度`, `會計年度 2025`, `年_2025`, `西元年`, and `出生年` all still classify bare 4-digit `1900–2099` values as a year-ticked date axis.

- [x] **Clean state reset on error & keyboard focus retention in `withBusy` (`src/main.ts`, `src/a11y.ts`).**
      - In `handleText` (`src/main.ts`), reset `state = null` when catching a parse/detect error so no stale chart state lingers while `#result` is hidden.
      - Extract/update `withBusy` so it sets `aria-busy="true"` during execution, clears `aria-busy` in `finally`, and restores `.focus()` to the button if it was the `document.activeElement` before being disabled.
      - **Must keep working:** All 468 existing tests pass (+19 v1.11 tests, 487 total across 23 suites); `npm run build` succeeds; PNG and SVG exports remain byte-deterministic; zero CSP violations.

## v1.12 — silent-wrong-chart remediation, publication craft & workflow polish (confirmed 2026-11-03 via delegated multi-subagent adversarial review)

Synthesized from the 2026-11-02 benchmark review (Datawrapper, Financial Times, Ray.so, Carbon, Excalidraw, Squoosh), executed codebase audit, and 3-adversary pre-mortem stress test. Every mechanism below was prototyped and verified against existing test invariants before code was written.

### Done criteria (v1.12)

- [x] **No anonymous bars — long or numerous categories auto-switch to horizontal bars (`src/chart.ts`).**
      - When `detection.type === "bar"`, `detection.xColumn.type !== "date"`, and `detection.xColumn.name !== "Row"`, if `maxLabelLen > 16 || (labels.length > 10 && maxLabelLen > 4)`, `buildConfig` switches to `indexAxis: "y"` with `scales.x` as the numeric value axis (`beginAtZero: true`, gridlines, axis title) and `scales.y` as the horizontal category axis (`grid: { display: false }`, `maxRotation: 0`, `autoSkip: labels.length > 18`), preserving CSV top-to-bottom category order (`y_0 < y_1`).
      - For vertical categorical bar charts (`xColumn.type !== "date"` and below the horizontal threshold), `autoSkip` is `false` when `labels.length <= 10 && maxLabelLen <= 16` so no category bar is ever drawn without its label. Categorical `line` charts set `maxRotation: labels.length > 12 || maxLabelLen > 16 ? 55 : 0`.
      - **Asserted as a property:** Across all 5 presets (`twitter`, `instagram`, `story`, `slide`, `a4print`), an 8-department long-label CSV (`17–34` chars each) renders all `8` department labels in the exported SVG `<text>` nodes (`labelsRendered === 8`, where v1.11 rendered `4`) with monotonic top-to-bottom `y` coordinates and `x >= 0`.
      - **Must keep working:** `samples/fruit-votes.csv` (6 rows, max label 8 chars), `samples/edge-cases.csv` (4 rows, max label 14 chars), 12-row single-numeric-column charts (`Row` synthetic X), 12-row 2-letter code charts (`US, UK...`), and short 2–3 row bar charts keep vertical orientation, `scales.y.title`, rounded bar geometry, and byte-identical PNG/SVG exports (`reproducibility.test.ts`).

- [x] **Intra-column CJK magnitude normalization & honest mixed-unit axes (`src/csv.ts`, `src/a11y.ts`, `src/chart.ts`).**
      - Supersedes v1.11's face-value fallback specifically for **commensurable CJK decimal magnitude suffixes** (`億元?` = $10^8$, `萬元?` = $10^4$, `千元?` = $10^3$, `元` = $1$, preserving any consistent leading currency prefix such as `NT$ 50萬元`): when a numeric column mixes only commensurable CJK magnitude units (with plain `0` cells allowed to inherit the scale), `parseCsv` scales every cell into the column's dominant unit (ties broken by first-seen unit; rounded via `toPrecision(12)` to avoid IEEE-754 float noise in `#sr-table`) and emits a note (`Column “Revenue” mixes units (...) — normalized to <unit>.`), eliminating the 10,000× visual inversion on exported charts.
      - When a single column mixes **incommensurable** units (e.g. `$100` vs `€80`, or `$100` vs `50萬元`), values remain at face value with the `"read at face value"` note, and `column.unit` is cleared (`undefined`) so the exported PNG/SVG never falsely labels the entire axis `Price ($)`.
      - `mixedUnitsNote` (`src/a11y.ts`) compares raw `yColumns.map(c => c.unit ?? "")` so shared-axis multi-series charts mixing a unit (`$`, `%`) with a unitless column (`""`) emit a clear warning, closing the `.filter(Boolean)` blind spot.
      - When **all** plotted `yColumns` on a multi-series `line` or `bar` chart share the exact same non-empty `unit`, the value-axis title (`scales.y` or `scales.x` when horizontal) displays that shared unit (`axisTitle(sharedUnit, true)`); heterogeneous or unitless multi-series keep the value-axis title hidden.
      - **Asserted as a property:** In the exported SVG for `A,2億元` vs `B,5000萬元`, bar `A`'s geometric length is `4×` bar `B`'s (and for `1.2億元` vs `50萬元`, ratio `> 100×`), whereas v1.11 rendered `A` shorter than `B`.
      - **Must keep working:** Uniform-unit columns (`50萬元, 80萬元`) emit no note; cross-column `$` vs `%` still emits `Multi-series chart contains mixed units ($, %) on the same axis`; scatter plots emit no mixed-unit warning.

- [x] **Chronological & continuous-axis integrity across `line` / `bar` / `scatter` overrides (`src/detect.ts`, `src/chart.ts`, `src/a11y.ts`).**
      - **Chronological bar/line parity:** When `detection.xColumn.type === "date"` on a non-time-scale chart (e.g. forcing `bar` on a newest-first CSV `2025-03-01, 2025-02-01, 2025-01-01`), `buildConfig` sorts valid date rows chronologically (`Oldest → Newest`) and filters `NaN` dates identically to time-axis `line`, keeping `config.data.labels`, `datasets`, SVG `<text>` X-positions, and `#sr-table` synchronized.
      - **Continuous numeric X-axis on forced `line`:** When a CSV has `>= 2` numeric columns and no date or category columns (e.g. `Dose (mg), Response (%)` with `[1, 2, 10]` or `samples/height-weight.csv`), forcing `line` plots `numbers.slice(1, 1 + MAX_SERIES)` against `xColumn = numbers[0]` on a continuous `linear` X-axis (sorted by X, with `{x, y}` points, `scales.x` title, and full `buildSrSummary` + `populateSrTable` support) instead of plotting both columns over synthetic `Row 1..N`. Asserted on SVG path geometry: horizontal pixel span `dx(2→10) > 6 * dx(1→2)`.
      - **Scatter entity labels:** When forcing `scatter` on a CSV that also contains a category or date column (`Country, GDP, Population, Area`), `populateSrTable` includes that column as `<th scope="row">` row headers in `#sr-table` (aligned with valid numeric `{x, y}` rows), and `collectNotes` notes that label column `"Country"` is not shown on scatter points while keeping `detection.droppedSeries` strictly for dropped numeric columns (`["Area"]`).
      - **Must keep working:** Ascending date CSVs (`samples/monthly-sales.csv`), category+number CSVs forced to `line`, single-numeric-column CSVs (`bar` by `Row`), and `robustness.test.ts` `droppedSeries` assertions remain unchanged.

- [x] **Summary-row (`Total` / `合計`) guard, scientific-notation units, regional currencies & dot/quarter dates (`src/csv.ts`, `src/detect.ts`, `src/chart.ts`, `src/types.ts`).**
      - **Trailing summary-row exclusion:** In a `while (body.length >= 3)` loop before column classification, when the final row's first label cell matches an exact summary token (`/^(?:total|grand\s+total|sub[-\s]?total|sum|average|avg|mean|合計|總計|小計|總額|平均)$/i`), at least 2 data rows remain above it, and at least one numeric cell appears in that row while all non-label cells are numeric or missing placeholders, `parseCsv` peels that trailing row and appends a note (`Excluded summary row “Total” so it doesn't distort the scale.`) — handling stacked `Total` + `Average` footers and preventing `"2025-01, 2025-02, 2025-03, Total"` (`3/4 = 0.75 < 0.8`) from degrading from a time `line` chart into a `bar` chart dominated by `Total`. Names like `"TotalEnergies"` or `"Total Recall"` are untouched.
      - **Scientific-notation unit & EU comma-exponent support:** `detectNumberStyle` counts units for `VALID_NUM_RE` cells before the `NUMERIC_SHAPE` separator filter (preserving `unit: "$"` on `$1.5e6` without regressing `"1.111.222"` + `"1.234e5"` in `test/numbers.test.ts:71`), and `detectNumberStyle` + `toNumber` recognize single-comma scientific notation (`1,5e6` → `1500000`).
      - **Regional currencies & unambiguous dates:** Expand `CURRENCY_PREFIX` / `UNIT_SUFFIX` with `HK$`, `HKD`, `S$`, `SGD`, `A$`, `AUD`, `C$`, `CAD`, `NZ$`, `NZD`, `CHF`, `₩`, `KRW`, `₹`, `INR` (longest-first, ticker guard intact for `$AAPL` / `HK$AAPL`). Support **3-segment** year-first dot dates (`2025.01.05` as validated local midnight; 2-segment `2025.01` is intentionally excluded so decimal prices like `2025.01` are never hijacked as dates) and quarters (`2025-Q1`..`2025-Q4`, `2025 Q1`, `Q1 2025`, `2025/Q1` with `quarterAxis` setting `time.unit = "quarter"` while keeping `date-adapter.ts`'s pinned `"QQQ - yyyy"` format).

- [x] **Zero-friction sharing & resilient UI lifecycle (`src/export.ts`, `src/main.ts`, `src/a11y.ts`, `src/style.css`, `index.html`, `vite.config.ts`).**
      - **1-Click `Copy PNG` to clipboard:** Add `<button id="copy-png" type="button" class="btn">Copy PNG</button>` to `.export-bar` (`#dl-png` stays primary `.btn.btn-primary`; `#dl-svg` uses `.btn` for clean hierarchy), writing `ClipboardItem` (`Promise<Blob>` first for Safari transient activation, falling back to `await blobPromise` if needed), announcing `"Copied PNG to clipboard."` via `.status.info`, with graceful error feedback if unsupported.
      - **Presentation `Slide 16:9 · 1920×1080` preset & slugified filenames:** Insert `{ id: "slide", label: "Slide 16:9 · 1920×1080", width: 1920, height: 1080 }` into `PRESETS` before `a4print` (keeping `PRESETS[PRESETS.length - 1]` as `a4print` for `test/png.test.ts`). Export filenames use `slugifyTitle(state.title)` (Unicode `\p{L}\p{N}`, max 50 chars: `${slug}-${preset.id}.png`/`.svg`, falling back to `chartsnap-${preset.id}`).
      - **Silent live sample on initial load:** Pre-render `Monthly sales` on initial page load without scrolling (`skipScroll`) and without `#status` chatter, styling `.chip.active` + `aria-pressed="true"` via `syncSampleChips`; any file load, paste, `__cs.load()`, or error clears chip active state, and explicit load errors still reset `state = null` and hide `#result`.
      - **Non-destructive global paste, `FileReader` race guard, Chart cleanup & SW catch:**
        1. Opportunistic `document` `paste` ignores `INPUT`/`TEXTAREA` targets and pre-validates `parseCsv` + `detectChart` in `try/catch` before touching state — accidental multi-line prose/code pastes stay completely inert without wiping an active chart or flashing errors.
        2. `handleFile` guards `FileReader` callbacks with a monotonic request ID so a slow earlier file cannot overwrite a newer file.
        3. `handleText` error catch calls `previewChart?.destroy(); previewChart = null;`, and `renderPreview` destroys the previous `previewChart` *before* mutating `previewCanvas.width/height`.
        4. User-initiated renders announce brief screen-reader confirmation via `.status.sr-only` when `notes` is empty (WCAG 4.1.3 without visual banner clutter), and `vite.config.ts` adds a `.catch()` fallback `503 Response` on offline non-navigate asset cache misses.

- [x] **Documentation sync, supply-chain pinning & Core Rule 2 property assertions (`README.md`, `docs/`, `CONTRIBUTING.md`, `.github/workflows/`, `package.json`, `test/`).**
      - Update `README.md`, `CONTRIBUTING.md`, and `docs/LAUNCH.md` to accurately reflect v1.10–v1.12 capabilities, 5 presets, and test counts; annotate shipped items in `docs/SPEC.md`'s historical `Later` notes.
      - Pin GitHub Actions in `ci.yml` and `deploy.yml` to verified commit SHAs, deduplicate redundant `push: [main]` runs in `ci.yml` (while keeping `deploy.yml`'s fail-closed `npm test && npm run build` gate), and pin `devDependencies` in `package.json` + `package-lock.json` to exact lockfile versions (`1.12.0`).
      - Upgrade `readFileSync` substring checks in `test/v17.test.ts` to behavioral assertions (verifying rendered `1,000,000` comma ticks in exported SVG `<text>` nodes and executing the generated SW script against mock `caches`/`fetch`).
      - **Must keep working:** All existing tests (updated only at `test/v111.test.ts:37-44` where v1.12 explicitly supersedes v1.11's mixed-CJK face-value expectation) plus new v1.12 property suites pass across all 5 presets and 3 themes; `npm run build` succeeds; PNG and SVG exports remain byte-deterministic; zero CSP violations.

## v1.13 — input fidelity, keyboard velocity, dimension defense & social discoverability (confirmed 2026-11-09)

Addresses real-world friction and edge robustness identified in the project audit: adds native TSV file picker support, strips invisible UTF-8 BOM markers in CSV parsing, provides fallback dimension defaults in `buildConfig` to eliminate `NaN` risk, adds `Ctrl+Enter` / `Cmd+Enter` keyboard submission to the paste area with empty-paste status feedback, and enriches `index.html` with Open Graph and Twitter Card social metadata.

### Done criteria (v1.13)

- [x] **TSV native file picker support (`index.html`):**
      - `<input id="file">` adds `.tsv` and `text/tab-separated-values` to its `accept` attribute, allowing native file dialog selection of TSV files matching existing spreadsheet paste support.
- [x] **UTF-8 BOM strip in `parseCsv` (`src/csv.ts`):**
      - `parseCsv` strips leading `\uFEFF` before passing text to PapaParse, ensuring zero-width BOM markers from Excel or clipboard pastes never contaminate the first column's header name, chart title, or year-header checks.
- [x] **`buildConfig` dimension defaults defense (`src/chart.ts`):**
      - `buildConfig` defaults `width` to `opts.width ?? 1200` and `height` to `opts.height ?? 675` so partial option objects never cascade `NaN` into font scaling, geometry padding, or point radii.
- [x] **Keyboard submission (`Ctrl+Enter` / `Cmd+Enter`) & empty-paste feedback (`src/main.ts`):**
      - `#paste-area` listens for `(e.ctrlKey || e.metaKey) && e.key === "Enter"` to trigger immediate rendering.
      - Submitting an empty paste area displays a polite status message (`"Please paste or enter CSV text first."`) via `.status.error` instead of a silent no-op.
- [x] **Open Graph & Twitter Card social meta tags (`index.html`):**
      - `index.html` defines `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, and `twitter:card` pointing to `docs/hero.png` and `https://kbwen.github.io/chartsnap/` for rich social preview cards.
- [x] **Must keep working:**
      - All 552 existing tests pass (+ new v1.13 property tests); `npm run build` succeeds; zero CSP violations; SVG/PNG byte-determinism maintained across all presets and themes.

## Non-goals / Later / Not now

- NO field/axis mapping or chart-type gallery UI (that is RAWGraphs' turf — we lose if we
  compete there). The single line/bar/scatter override above is an escape hatch, NOT field
  configuration; zero-config stays the default.
- No dashboards, no multi-chart, no data storage, no accounts, no analytics, no AI
- Later: ~~color/theme presets~~ (**shipped in v1.9**), .xlsx input, editable chart title/labels
- Later (surfaced by the review — see DECISIONS): sort categorical bars by value +
  ~~horizontal bars for long labels~~ (**shipped in v1.12**); aggregate (sum/count) categorical data instead of
  plotting/sampling raw rows; data labels on bars.

### Found by the 2026-07-16 review (12 reviewers: 6 expert lenses + 6 user personas; historical backlog — most items shipped in v1.5–v1.12 as noted below)

Everything the round found that v1.4 does **not** take. Recorded so none of it is lost.
All were reproduced by an executed run, not by reading.

**v1.5 — accessibility** (**shipped across v1.5–v1.12**: contrast in v1.8, DOM title + `#sr-table` + live regions + `<button>` dropzone in v1.6, `prefers-reduced-motion` in v1.7, `withBusy` focus in v1.11, silent-render SR status in v1.12):
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

**v1.6 — chart quality, mobile, landing** (**shipped across v1.5–v1.12**: CVD palette in v1.5.2/v1.9, thousands separators + CJK SVG fonts + NFKC in v1.7, mobile `@media` + `navigator.share` + Stories + CSP `connect-src 'none'` in v1.5, horizontal bars + shared multi-series unit + live sample on load in v1.12):
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

**Needs a scope decision before it can be specced** (note: continuous numeric X on forced `line` and trailing `Total` exclusion **shipped in v1.12**; year header boundary **shipped in v1.11**; currency/percent + units **shipped in v1.10–v1.12**; SW cache fallback + `papaparse` pinning **shipped in v1.5.2/v1.7/v1.12**):
<!-- historical items below -->
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
