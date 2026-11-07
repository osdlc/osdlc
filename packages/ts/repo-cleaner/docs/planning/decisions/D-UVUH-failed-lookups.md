---
id: D-UVUH
type: decision
state: accepted
created: 2026-11-07
---

# D-UVUH: In repo-cleaner, a failed lookup costs its evidence; a failed fetch costs the repository

Accepted 2026-11-07, in [#656](https://github.com/osdlc/osdlc/pull/656) (issues
[#653](https://github.com/osdlc/osdlc/issues/653) and
[#655](https://github.com/osdlc/osdlc/issues/655)).

## Decision

| Failure                                             | Result                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The pull request listing (`gh pr list`, `glab api`) | No PR evidence. Rows are judged on git evidence, and the repository carries a note. Deleting a remote branch with no known PR needs `confirm-open-pr`. |
| The provider's CLI missing or signed out            | Never asked, so the same as a failed listing: a note, and `confirm-open-pr` on remote branches with no known PR.                                       |
| `git ls-remote` after a successful fetch            | Remote tips come from the refs that fetch just wrote. The repository and each remote row carry a note.                                                 |
| The fetch                                           | The repository is an error with no rows, as before.                                                                                                    |

- **`--offline` never runs `ls-remote` to judge.** It reads remote branches
  from `refs/remotes/<remote>/`, so judging does not contact the remote;
  `clean`'s remote steps still do. Pull requests are still looked up, unless
  `--provider none` is given.
- **`clean` never deletes on the strength of a tracking ref.** A tracking ref
  stays until a prune, so an offline plan can name a branch the remote
  already deleted, or show a tip someone has pushed past. `clean`'s re-check
  reads the remote's tips with `ls-remote`: a branch that is gone, or whose
  tip moved, is skipped, and a spared one refuses the run, as it would online.
  If that `ls-remote` fails, the run is refused: it does not fall back to the
  refs it is there to replace.
  A branch deleted between the re-check and the push is reported gone, not a
  failure, and the run summary counts it apart (`Step.gone`).
- **A note is a sentence on `RepoSweep.notes`.** The text and summary reports
  print notes under the repository's header, and the JSON carries them.
  `--format commands`, `plan` and `clean` print them on stderr, `clean` from
  its re-check (`Preview.notes`) and the run's own (`RunOptions.onNotes`).

## Why

A lookup only adds evidence. Losing it should not cost the worktrees and
local branches, which need no network. A host sweeping many repositories
otherwise has to catch the error and sweep that repository again with
`provider: 'none'`.

A fetch is different. Without it, every row, local ones included, is
measured against a default branch older than the one asked for. `clean`
relies on this to refuse before any step when its re-check cannot fetch.

## Options rejected

- **Treat a failed fetch like `--offline`, with a note.** It would hide a
  stale default branch behind a sentence. A person who wants the on-disk
  refs says `--offline`.
- **Read the tracking refs even after a fetch.** `ls-remote` also sees
  branches that a narrowed fetch refspec leaves out.
- **Leave remote rows as they are when the listing fails.** Deleting an open
  PR's head branch closes the PR. A failed listing is often transient, and
  `clean --yes` acts on the sweep at once, so the missing guard would not be
  a choice the person made, as it is with `--provider none`.

## Consequences

- `lookupPrs` returns `{ prs, error }` and replaces `fetchPrs`. A
  `PrProvider` reports a failure by returning null or by throwing a reason.
- A plan made with PR evidence drops a row whose PR evidence is gone at the
  re-check, because the fingerprint holds the PR's number and state.

## Reopen if

A host needs a fetch failure to degrade, for example a sweep of many
repositories where some remotes are routinely offline.
