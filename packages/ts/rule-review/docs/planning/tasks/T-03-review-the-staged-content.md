---
id: T-03
type: task
state: open
created: 2026-11-07
---

# T-03: Review the staged content

## Goal

`rule-review --staged` judges what is about to be committed, for a pre-commit
hook, as `rule-review checks --staged` already selects by it.

## Today

A review compares the fork point with the working tree, so unstaged edits are
judged too. `stagedFiles` lists the staged paths, but `fileDiffs` reads the
working tree.

## Proposed

- `fileDiffs` takes `{ staged: true }` and diffs the index against `HEAD`.
- `reviewChanges` takes `staged: true`; the command takes `--staged`, exclusive
  with `--base`.

## Acceptance criteria

- [ ] A test stages one edit, leaves another unstaged, and the judged diff
      holds only the staged one.
