---
id: T-01
type: task
state: open
created: 2026-11-22
---

# T-01: Read objects, diffs and pull requests through the typed verbs

## Goal

`code-stats` runs no raw `git` or `gh` argument list that `@osdlc/typed-git` or `@osdlc/typed-gh`
can run for it.

## Today

Four places build their own argv, written when the typed packages lacked the verb. Each now has
one:

- `src/git/blobs.ts` runs `git cat-file --batch-check` and `--batch` itself to read blobs byte for
  byte. `@osdlc/typed-git` has `catFileBatch`, which does the same in bounded chunks.
- `src/git/change.ts` passes `DIFF_FLAGS` to `git diff` so the user's git config cannot change
  what `parseDiff` reads. `@osdlc/typed-git`'s diff verbs pin the same settings.
- `src/git/change.ts` reads a PR's base and head commits with a raw `gh pr view`.
  `@osdlc/typed-gh`'s `PullRequest` has `baseRefOid`.
- `src/git/repo.ts` wraps the `gh` runner to remove colour from its output.
  `@osdlc/typed-gh` forces colour off itself.

## Approach

1. Swap each place for the typed verb, one at a time. Each swap keeps the existing tests.
2. Check that the typed verb gives byte-identical output for a binary file, a file with invalid
   UTF-8, a rename and an untracked file in the working tree.
3. Keep `DIFF_FLAGS` exported while a caller runs `git diff` itself for `parseDiff`.

## Acceptance criteria

- [ ] `grep -rn "cat-file\|'pr', 'view'" src` finds nothing.
- [ ] `tests/git.test.ts` and `tests/cli.test.ts` pass unchanged.
