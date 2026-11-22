---
type: backlog
schema_version: '3'
id: B-0001
tags:
  - host-cleaner
  - plugins
  - scheduling
  - orca
  - claude-code
last_reviewed: '2026-11-22'
---
# Bring back the full plugin design

The first version of host-cleaner is deliberately small: `status`, `plan`,
`clean` and `config`, the `git`, `cargo` and `node` plugins, and a config of
`targets`, `ignore` and `idleHours`. A fuller design was built and merged first,
then rolled back before any release to keep the first version simple. This item
keeps that design on record so it can come back piece by piece.

## Where the code is

Everything below is on `main` at `aee62c5b9605` (2026-11-22), the last commit
before the rollback. Restore a piece from there rather than rewriting it. The
pull requests that built it: #958, #962, #963, #964, #965 (`clean --auto` and
`schedule`), #988 (`orca`), #982, #983 (ignore and idle), #984 (machine scope),
#985 (profiles). The design review is in #951: `docs/parley/host-cleaner-design.json`
and `docs/parley/host-cleaner-plugins.json`, with the owner's answers.

## What was removed, and what would bring it back

| Piece | What it did | Bring it back when |
| --- | --- | --- |
| `clean --auto` | Cleaned the safe subset with no person present: candidates a plugin marked `unattended` that nothing refused or protested, under a lock, writing a report and a receipt. Refused to run without explicit `targets`. | Manual `clean` has run long enough to trust its safety rules unattended. |
| `schedule` | A launchd user agent (macOS) that ran `clean --auto` every `--every` hours (default 6). | `clean --auto` is back and someone wants it on a timer. |
| `unattended` mark | A candidate field plugins set when deleting it needs no person. | With `clean --auto`. |
| `orca` plugin | Worked beside `git` on Orca worktrees: refused one with an agent at work, protested open terminals (`close-terminals`), closed them in `prepare`, and had Orca forget the record in `deleted`. Also proposed `orca-record` candidates for records whose folder was gone, and added Orca's repositories in `scope`. | Orca's stale records or terminals become a real cost. Until then, Orca users add Orca's worktree folder to `ignore`. |
| `claude-code` plugin | Listed running Claude Code sessions (`ps`, `lsof`, `@osdlc/detect-harness`) and closed one only when picked and allowed by name; refused host-cleaner's own session. | Stray sessions need closing often enough to want a command for it. |
| `scope`, `prepare`, `deleted` hooks and the `note` level | Contract parts only `orca` used. | With `orca`, or the first other plugin that needs them. |
| Machine-scope plugins (`roots`) | A plugin cleaning outside any checkout declared its roots; the core proved each candidate strictly inside one on real paths and checked again before `delete`. | The first plugin that cleans a machine folder, such as a toolchain cache. |
| `plugins.<name>` settings | Per-plugin config, validated per plugin; a misspelt name was a config error. | A plugin needs a setting of its own. |
| Profiles (`--profile`) | Named config overrides, such as a `deep` profile with `idleHours: 0`. | One config file is not enough. |

## Open points from the review

These were still open when the design was rolled back, and come back with it:

- The run order of plugins, and what it decides (q-order).
- Orca reachable but its list failing refuses every worktree; Orca not running
  falls back to git with a warning (q-orca-heuristic, q-orca-refuse).
