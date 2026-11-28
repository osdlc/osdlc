---
type: backlog
schema_version: '3'
id: B-0001
tags:
  - workstation-cleaner
  - scheduling
  - profiles
last_reviewed: '2026-11-23'
---
# Bring back unattended cleaning, profiles and the claude-code plugin

The first version of workstation-cleaner runs only when a person runs it: `status`,
`plan`, `clean`, `config` and `plugins`. It keeps the plugin model, with the
`git`, `cargo`, `node` and `orca` plugins and every hook, because Orca is the
first of several tools (other ADEs and IDEs) that take part in cleaning shared
locations on disk. What is cut is the part that ran with no person present, a
second layer of config, and the `claude-code` plugin. All three were built and merged first,
then rolled back before any release to keep the first version simple: `clean
--auto` and `schedule` in the pull request that adds this item, profiles and
`claude-code` in the next one (#1061). This item keeps them on record so they
can come back. They are also what
[D-L7N5](../../../../../../docs/decisions/D-L7N5-host-cleaner.md) decided and
the first version leaves out
([D-R8KM](../../../../../../docs/decisions/D-R8KM-host-cleaner-v1-attended-only.md)):
the unattended subset, launchd scheduling, and the `claude-code` adapter with
its `close-session` risk.

## Where the code is

Everything below is on `main` at `3a401796aa2d` (2026-11-22), the commit this
rollback starts from. Restore a piece from there rather than rewriting it. The
pull requests that built it: #965 (`clean --auto` and `schedule`), #985
(profiles) and #964 (the `claude-code` plugin, `src/claude.ts`). The design
review is in #951:
`docs/parley/host-cleaner-design.json`, with the owner's answers.

## What was removed, and what would bring it back

| Piece | What it did | Bring it back when |
| --- | --- | --- |
| `clean --auto` | Cleaned the safe subset with no person present: candidates a plugin marked `unattended` that nothing refused or protested, under a lock (`@osdlc/file-lock`), writing a report and a receipt. Refused to run without explicit `targets`. | Manual `clean` has run long enough to trust its safety rules unattended. |
| `schedule` | A launchd user agent (macOS) that ran `clean --auto` every `--every` hours (default 6). | `clean --auto` is back and someone wants it on a timer. |
| `unattended: true` | A candidate field plugins set when deleting it needs no person. Its other half, "hold for review", stays as `held: true`. | With `clean --auto`. |
| Profiles (`--profile`) | Named config overrides, such as a `deep` profile with `idleHours: 0`. | One config file is not enough. |
| The `claude-code` plugin | Listed running Claude Code sessions (`session:<pid>`), found with `ps` and `lsof` and detected through `@osdlc/detect-harness`, and closed one with SIGTERM when it was picked and `--allow close-session` was given: its sessions were `unattended: false`, which at `3a401796aa2d` held a candidate back from the default run, as `held: true` does now. It refused the session workstation-cleaner itself ran inside (`own-session`). | Someone wants workstation-cleaner to close agent sessions again. |
