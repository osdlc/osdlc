# @osdlc/repo-cleaner

## History before the first public release

These versions were never published. The first release of `@osdlc/repo-cleaner` on
npm is 0.5.0, and the entry for it is added above this section when it is released.

### [0.4.3] (unpublished)

#### Added

- `VENDOR_DIRS` export.

#### Changed

- Stops depending on an internal wrapper for its directory names.
- The directory vendor is `repo-cleaner` and the override variables are `REPO_CLEANER_*`, in place of an internal vendor name.
- The `FLEET_ROOT`, `FLEET_*` and `FLEET_MACHINE_CONFIG` variables are no longer read; there is no fallback, and the replacements are `REPO_CLEANER_ROOT`, `REPO_CLEANER_*` and `REPO_CLEANER_MACHINE_CONFIG`. The config directory paths themselves do not change.
- Compiled JavaScript with `.d.ts` for Node, in place of TypeScript source for Bun.

#### Fixed

- The current-worktree check uses `@osdlc/path-guard`: a cwd is placed by its real path, `..` taken
  through a symlink included, and a cwd that no longer exists below a symlinked parent still counts.
- Git reads use the typed git client's soft door and its new API.
- Path containment is separator-aware, so a sibling directory that shares a path prefix is not
  counted as inside.

### [0.3.0] - 2026-10-06 (unpublished)

#### Added

- **Plan and apply.** `planRepo`, `writePlan` and `readPlan` write and read the
  deletable rows of a sweep with a fingerprint of each. `applyPlan` sweeps
  again, drops rows that moved or lack an authorization, deletes
  compare-and-swap, verifies each step and writes a receipt. A host passes its
  re-ranking as the `annotate` hook.
- **`repo-cleaner apply`, `--branch`, `--write-plan`, `--plan-out`.** The CLI
  plans and applies on its own, and runs on `defineCli`/`runMain`.
- **`worktreeRemoveCommand` / `worktreePruneCommand`.**

#### Changed

- Every emitted command quotes its words for the shell, so a path with a space
  pastes as one argument.
- **BREAKING:** "Nothing to sweep" exits `10`, not `2`, which means a malformed
  command.

### [0.2.0] - 2026-10-05 (unpublished)

#### Added

- **Worktree blockers.** A worktree that is locked, has files flagged
  skip-worktree or assume-unchanged, holds a nested repository in an
  untracked or ignored directory, or shares its branch with another worktree
  is `needs-investigation` with no command and `deletable: false`.
  `facts.blockers` names each one, and the investigation parts say what to
  do about it.
- **Named authorizations on every row.** `requires` lists what a delete of
  the row needs approved: `abandon-unmerged` (commits not on the default
  branch or an exact-head merged PR, counted in `facts.unique_commits`),
  `discard-changes` (a dirty worktree), `confirm-open-pr`. `deletable: false`
  marks rows kept for structure. `requiresNote` renders them.
  `proposedCommands` (`--commands`) leaves out rows that need one.
- **Fetch before classifying.** `SweepOptions.fetch` runs
  `git fetch --prune --quiet --no-write-fetch-head <remote>` first; a failed
  fetch makes that repository an error row. `RepoInfo.fetched` records it. The
  CLI fetches by default; `--no-fetch` turns it off.

#### Changed

- **BREAKING: `investigation_prompt` became `investigationParts`.** A list of
  sentences rather than one string, so a host can append its own before
  rendering.
- **BREAKING: task-derived verdicts are gone.** A host applies them to
  the returned rows. Every git-derived verdict already outranked them, so
  nothing in the ladder moved.
- **PR state reads through the typed GitHub client** rather than a hand-rolled
  `gh pr list --json` and `JSON.parse`.
- **A merged PR is landing proof only on an exact head match.** It must come
  from this repository, target the default branch, and have the branch tip as
  its head commit. Otherwise `facts.pr.evidence` names the gap (`head-moved`,
  `other-base`) and the row needs investigation. Fork PRs are ignored.
  Local-branch `facts.sha` is the full sha.
- **BREAKING: local-branch ancestry is measured against `<remote>/<default>`.**
  A branch merged only into an unpushed local default branch is no longer
  `safe-to-delete`. The local default is used only when there is no remote,
  and a missing remote-tracking ref leaves ancestry unknown. The fact is
  renamed `ancestor_of_remote_main`, and `facts.compare_against` names the ref.
- **BREAKING: branch deletes are compare-and-swap on the judged sha.** Local
  rows propose `git update-ref -d refs/heads/<b> <sha>` in place of
  `branch -d` / `-D`; remote rows propose
  `git push --force-with-lease=refs/heads/<b>:<sha> <remote> :refs/heads/<b>`
  in place of `push --delete`. Both refuse when the branch moved after the
  sweep. `localDeleteCommand` / `remoteDeleteCommand` are exported.

#### Fixed

- A slashed default branch name is read whole: `release/v2` stays
  `release/v2` rather than becoming `v2`.

### [0.1.0] - 2026-09-13 (unpublished)

The sweep was extracted into a standalone package; a host's own knowledge
stays outside it, as an annotation over the returned inventory.

#### Added

- **`sweepRepo` / `sweepRepos`.** A repository's local branches, worktrees and
  remote branches, classified `safe-to-delete` / `safe-to-keep` /
  `needs-investigation`, each row carrying the evidence behind its verdict and
  the command that would act on it. Read-only.
- **Multi-repository resolution.** What an entry names is read off the disk:
  a checkout names that repository, anything else is searched for the
  checkouts under it. The report says what that search cost — entries
  searched, directories read, checkouts found — and an enormous tree says so
  on stderr mid-walk rather than after it. Candidates de-duplicate on the main
  checkout, so a linked worktree collapses into the repository it belongs to.
  An entry that resolves to nothing is reported, never dropped.
- **Duplicate checkouts.** `SweepResult.duplicates` lists each remote that
  two or more separate main checkouts share, and the text report opens with a
  "Duplicate checkouts" section. A linked worktree is not a duplicate. Report
  only.
- **Per-repository error containment.** A repository that cannot be read
  becomes an `error` row and the sweep continues. Single-repository callers
  check the field.
- **The config file is `@osdlc/config-layers`'s machine file** —
  `<config-home>/repo-cleaner/config.yaml`, Zod as the contract, never
  throws, relocated by `REPO_CLEANER_MACHINE_CONFIG` or `--config`. It
  carries `paths:` as well, so a `repos:` entry says `{dev}` instead of
  spelling a directory twice.
- **The `repo-cleaner` CLI.** Scope is opt-in: a bare invocation sweeps the
  repository you are standing in, `--all` reaches the config file, and
  positional paths name repositories directly. `--output json`, `--commands`,
  `--scope`, `--no-gh`, `--keep`.
