# Contributing

Small tool, but issues and PRs are welcome.

A couple of things to know before you open a PR:

- **It stays zero-config.** Drop a CSV, get a chart — that's the whole idea. If a
  change adds a settings panel or a field-mapping UI, it probably belongs in
  [RAWGraphs](https://github.com/rawgraphs/rawgraphs-app), not here.
- **It stays 100% client-side.** No backend, no analytics, nothing phoning home.
- **Run `npm test` first.** If you touch the detection logic or the SVG export, add a
  case — the SVG smoke test exists because canvas2svg is held together with shims and
  breaks quietly.

```bash
npm install
npm run dev
npm test
```

`npm run dev` and `npm run build` need nothing but Node. `npm test` is fussier: four of the
test files render real charts through [node-canvas](https://github.com/Automattic/node-canvas),
which links against cairo and pango. On Windows and macOS you normally get a prebuilt binary
and it just works. On Linux, install the system libraries first — this is the exact set CI
uses, so it's the set known to work:

```bash
sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

If `npm test` dies with a native error mentioning `canvas` or `libcairo`, that's this and
not your change.

The most useful bug report is a CSV that charts wrong: paste a few rows and say what you
expected to see. What's in scope and what's deliberately left out is in
[docs/SPEC.md](docs/SPEC.md).
