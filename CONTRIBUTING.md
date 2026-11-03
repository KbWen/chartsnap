# Contributing

Small tool, but issues and PRs are welcome.

A couple of things to know before you open a PR:

- **It stays zero-config.** Drop a CSV, get a chart — that's the whole idea. If a
  change adds a settings panel or a field-mapping UI, it probably belongs in
  [RAWGraphs](https://github.com/rawgraphs/rawgraphs-app), not here.
- **It stays 100% client-side.** No backend, no analytics, nothing phoning home.
- **Run `npm test` first.** If you touch the detection logic or the SVG/PNG export, add a
  case — the export tests guard against quiet regressions in canvas2svg and headless rendering.

```bash
npm install
npm run dev
npm test
```

**On Windows and macOS, `npm install && npm test` works out of the box with prebuilt binaries.**

### Linux / WSL prerequisites

`npm run dev` and `npm run build` require only Node. Test files that render real charts headlessly link against [node-canvas](https://github.com/Automattic/node-canvas) (cairo and pango).

On Linux or WSL, install the system libraries first (the exact packages CI installs):

```bash
sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

If `npm test` fails with a native error mentioning `canvas` or `libcairo`, install those packages first.

### Reporting issues

The most useful bug report is a CSV that charts wrong: paste a few rows and say what you
expected to see. What's in scope and what's deliberately left out is in
[docs/SPEC.md](docs/SPEC.md).
