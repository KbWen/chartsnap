# chartsnap

Turn a CSV into a chart you can post, without uploading it anywhere.

Drop a file, chartsnap guesses a chart from your columns, and you download a PNG or SVG
sized for Twitter, Instagram, or an A4 page. It all runs in the browser, so your data
never touches a server.

**Live:** https://kbwen.github.io/chartsnap/

![A chartsnap line chart of weekly commits with a two-week gap, deep green line on a warm background](docs/hero.png)

## Why it exists

You've got a small spreadsheet and want one good-looking chart for a post or a doc.
The usual options are all a bit annoying: Excel looks like Excel, Datawrapper and
Flourish want a login and put SVG behind a paywall, RAWGraphs makes you map every axis
by hand, and pasting company numbers into a chatbot means they've left your laptop.

chartsnap keeps it local and boring: drop, chart, download. It works offline, nothing
uploads, and the same CSV always gives you the same chart. SVG export is free.

## Try it

Open the [live version](https://kbwen.github.io/chartsnap/), or run it locally:

```bash
npm install
npm run dev
```

No CSV to hand? There are sample buttons on the page.

![Loading a CSV in chartsnap and switching between line, bar, and scatter](docs/demo.gif)

## How it picks a chart

It looks at what's in each column:

| Your data                          | Chart        |
| ---------------------------------- | ------------ |
| a date column                      | line         |
| 4-digit years under a `year` header | line, by year |
| text categories + numbers          | bar          |
| two or more number columns         | scatter      |
| a single number column             | bar, by row  |

Extra number columns become extra series, up to six — if any don't fit, the chart says
which. Guessed wrong? There's a line / bar / scatter switch under the chart — the only
setting, and that's on purpose.

Then pick a size and download. PNG and SVG both, free, no watermark.

- Twitter — 1200 × 675
- Instagram — 1080 × 1080
- A4 print — 3508 × 2480 (300 DPI)

## What it handles

Quoted commas, US and European numbers (`1,234.56` and `1.234,56`, decided per column),
dates that mean the same day in every timezone, blank cells (drawn as gaps), big files
(sampled down with a note), and files that aren't UTF-8 (you get a "re-save as UTF-8"
note instead of garbled text).

It works offline once you've loaded it — a service worker keeps the page and its assets
on your machine. The same CSV always produces the same chart, down to identical bytes in
the exported PNG and SVG. If a numeric column doesn't fit on the chart, it says which.

## What it isn't

- Not a chart builder. No axis/field editor — if you need to wire things up by hand,
  [RAWGraphs](https://github.com/rawgraphs/rawgraphs-app) does that well.
- No dashboards, accounts, or saved state.
- Editable titles and labels aren't in yet.
- A lone `3.850` is genuinely ambiguous — 3.85, or 3850 with a European thousands dot?
  It's read as 3.85 and the chart tells you so. Nothing in the column can settle it.
- It charts rows as they are — it doesn't sum or group them.

## Under the hood

Vite and vanilla TypeScript, [Chart.js](https://www.chartjs.org/) for drawing,
[PapaParse](https://www.papaparse.com/) for the CSV, and
[canvas2svg](https://github.com/gliffy/canvas2svg) for the vector export. No backend;
it ships as static files to GitHub Pages.

`npm test` runs the column-detection cases, the time-axis date adapter, and an SVG smoke
test — the tripwire that fails loudly if the vector export ever breaks on a Chart.js update.

## License

MIT © [KbWen](https://github.com/KbWen)
