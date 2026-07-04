<!-- micro-kit v1.4 — frozen seed copy: do not update installed copies in place; to adopt newer governance, graduate to agentic-os -->
# GEMINI.md — Micro-Tool Profile (Gemini CLI entry)

Gemini CLI loads only this file, so the core rules are inlined below instead
of imported. The canonical copy is `AGENTS.md` — if the two ever differ,
`AGENTS.md` wins. Open `AGENTS.md` at session start for the full workflow
and docs contract (this file only covers the non-negotiable rules).

## Chat Language

Reply in the user's input language. Repo artifacts stay English unless the
tool itself targets a Chinese-speaking audience.

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
3. **Small, reversible changes.** No unauthorized refactors. One concern per commit.
4. **No secrets** in any file, command, or output — ever. Vet every new
   dependency (a public repo is a supply-chain target); never inject
   unsanitized user input into HTML/DOM (XSS).
5. **Destructive command gate**: before `rm -rf`, `git reset --hard`, force
   pushes, etc. — state blast radius + rollback plan, get confirmation.
6. **Decision log**: any non-obvious choice (library, format, scope cut) gets
   one line in `docs/DECISIONS.md`. That file is the product's memory. If a
   session ends mid-feature, append one Progress line: done / next / blocked.
