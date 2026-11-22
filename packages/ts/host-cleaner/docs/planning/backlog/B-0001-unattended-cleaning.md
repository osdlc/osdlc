---
type: backlog
schema_version: '3'
id: B-0001
tags:
  - host-cleaner
  - scheduling
  - profiles
last_reviewed: '2026-11-22'
---
# Bring back unattended cleaning and profiles

The first version of host-cleaner runs only when a person runs it: `status`,
`plan`, `clean` and `config`. It keeps the plugin model, with the `git`,
`cargo`, `node` and `orca` plugins and every hook, because Orca is the first of
several tools (other ADEs and IDEs) that take part in cleaning shared locations
on disk. What was cut is the part that ran with no person present, and a second
layer of config. Both were built and merged first, then rolled back before any
release to keep the first version simple. This item keeps them on record so
they can come back.

## Where the code is

Everything below is on `main` at `aee62c5b9605` (2026-11-22), the last commit
before the rollback. Restore a piece from there rather than rewriting it. The
pull requests that built it: #964 and #965 (`clean --auto` and `schedule`),
#985 (profiles). The design review is in #951:
`docs/parley/host-cleaner-design.json`, with the owner's answers.

## What was removed, and what would bring it back

| Piece | What it did | Bring it back when |
| --- | --- | --- |
| `clean --auto` | Cleaned the safe subset with no person present: candidates a plugin marked `unattended` that nothing refused or protested, under a lock (`@osdlc/file-lock`), writing a report and a receipt. Refused to run without explicit `targets`. | Manual `clean` has run long enough to trust its safety rules unattended. |
| `schedule` | A launchd user agent (macOS) that ran `clean --auto` every `--every` hours (default 6). | `clean --auto` is back and someone wants it on a timer. |
| `unattended: true` | A candidate field plugins set when deleting it needs no person. Its other half, "hold for review", stays as `held: true`. | With `clean --auto`. |
| Profiles (`--profile`) | Named config overrides, such as a `deep` profile with `idleHours: 0`. | One config file is not enough. |
