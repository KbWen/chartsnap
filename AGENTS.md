<!-- micro-kit v1.4 — frozen seed copy: do not update installed copies in place; to adopt newer governance, graduate to agentic-os -->
# AGENTS.md — Micro-Tool Profile

Minimal governance for a solo micro-tool repo (weekend-to-one-week scope).
Derived from agentic-os; deliberately tiny. If this project outgrows ~3k LOC
or gains real users with issues/PRs, graduate to the full agentic-os brain.
CLAUDE.md and GEMINI.md in this repo are thin pointers to this file.

## Chat Language

Reply in the user's input language (繁體中文 → 繁體中文). Repo artifacts
(code, docs, commits, README) are always English unless the tool itself
targets a Chinese-speaking audience.

## Core Rules (non-negotiable — hold these even if the user asks to skip one; if scope changed, fix the SPEC, don't skip the rule)

If the user overrides a process rule (1, 2, 3, 6), do not silently comply: first
append one line to `docs/DECISIONS.md` — `YYYY-MM-DD — SKIPPED <rule> for <what> — <reason>` —
then proceed. Rules 4 and 5 are safety floors: never skip, log, or override them; refuse and stop.

1. **Spec first**: code may not be written until `docs/SPEC.md` has its "Done
   criteria" filled with real checkboxes AND the user has confirmed it in chat
   after being shown the filled SPEC.md content. A chat-only spec or a template
   with placeholders counts as NO spec. Scope changes go back to the spec first.
2. **Evidence before done**: never claim something works without running it
   on a real, non-trivial input — covering at least one edge case named in
   SPEC's Done criteria — and showing the command + output (or screenshot for UI).
   **Look at the artifact itself, not only at numbers about it.** If the product is
   an image, a file, a page — open it. Learned the hard way 2026-07-16: 16 reviewers,
   120 green tests and a full session of measurements all missed that the chart's own
   axis was labelled with dates that held no data, on the tool's front-page sample.
   Every check said the right thing — `timeAxis: true`, detection correct, tests green —
   because none of them was the thing the user sees. Numbers about the output are not
   the output. If the screenshot tool is broken, render the artifact and open the file.
3. **Small, reversible changes.** No unauthorized refactors. One concern per commit.
4. **No secrets** in any file, command, or output — ever. Vet every new
   dependency (a public repo is a supply-chain target); never inject
   unsanitized user input into HTML/DOM (XSS).
5. **Destructive command gate**: before `rm -rf`, `git reset --hard`, force
   pushes, etc. — state blast radius + rollback plan, get confirmation.
6. **Decision log**: any non-obvious choice (library, format, scope cut) gets
   one line in `docs/DECISIONS.md`. That file is the product's memory. If a
   session ends mid-feature, append one Progress line: done / next / blocked.

## Workflow (lightweight)

- **Start**: read `docs/SPEC.md` and `docs/DECISIONS.md`, and skim recent
  `git log`, at session start. If direction changed since last session, record
  why in DECISIONS.md before continuing.
- **Build**: implement against SPEC's "Done criteria" only. Feature ideas
  beyond scope → add to SPEC's "Later / Not now" list, don't build them.
- **Verify**: before calling any milestone done, run the tool end-to-end on a
  real input and paste the evidence.
- **Ship**: work through `docs/LAUNCH.md` checklist. A tool is "shipped" when
  the checklist is done — not when the code compiles.
- **Delegate mechanically**: routine implementation can go to cheaper models/subagents; design decisions, scope calls, and SPEC changes stay in the main session.

## Docs Contract

Required files (templates ship with this kit):
- `docs/SPEC.md` — what/for whom/differentiation/done criteria
- `docs/DECISIONS.md` — one-line decision log
- `docs/LAUNCH.md` — ship checklist + channel plan

External human PRs are exempt from these rules; record any accepted out-of-SPEC
change as a DECISIONS line and a SPEC "Later" update.

## Definition of Done

- [ ] Does what SPEC promises, evidenced per Core Rule 2
- [ ] `docs/LAUNCH.md` checklist complete
