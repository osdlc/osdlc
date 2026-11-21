---
'@osdlc/repo-cleaner': minor
---

The command line by phase and scope ([D-4CE9](packages/ts/repo-cleaner/docs/planning/decisions/D-4CE9-the-cli-by-use-case.md)). Breaking; nothing is kept for compatibility.

- Nothing runs until a phase is named: `status` (the old report), `plan`, `clean`, `cache`. The bare command explains them and exits 2.
- Scope: `--local` (the default), `--remote` (the default remote's branches), `--remote=<name>` (repeatable, `*` for every remote), `--all`, and `--worktrees` or `--branches`. `--only` is gone; the old `--remote` is `--all`; the report's `--all` is `--all-rows`. `--remote upstream` with a space is refused with the fix.
- Several remotes: each is fetched, and its branches judged against its own default branch. `--against <remote>` judges every row against one remote's default branch, as a fork against its parent. The default remote is `origin`, else the remote the default branch tracks, else the only remote.
- A fork's pull requests are read from its parent, so its branches no longer all need `confirm-open-pr`.
- `--fetch` fetches the default remote for local rows.
- `--pick` adds a row to the run instead of narrowing it; the library's `select` names rows exactly. `--spare` takes a glob, and a bare name spares that branch everywhere.
- `clean -i` chooses rows from a checklist and asks for each ticked row's risks.
- Library: `SweepOptions.remote` is `remotes`; `RepoInfo` gains `remotes`, `against` and `fetchedRemotes`; every judged row records `evidence.landedAgainst`, part of its fingerprint, which replaces a branch's `compareAgainst`. Plans are version 3.
