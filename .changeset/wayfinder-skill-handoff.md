---
'@osdlc/wayfinder': minor
---

New: hand an agent skill to an agent's CLI, as an explicit action beside copy. `way run /<name> --agent -- <args>` starts the first of `claude`, `codex` and `cursor-agent` on `PATH` whose agent reads the skill, in this terminal and the repository root, with `/<name> <args>` as its first prompt (`$<name>` for Codex), and exits with its code. `--harness <claude|codex|cursor>` picks the agent; `--dry-run --json` prints the run document, with the skill's id as `task`. In the terminal UI, `^g` on a skill does the same, asking first for what the skill's `argument-hint` names; the line under a skill says which agent `^g` starts. Enter, `^y` and the web view still copy `/<name>`, and plain `way run /<name>` still refuses, now suggesting `--agent` when an agent CLI is on `PATH`.
