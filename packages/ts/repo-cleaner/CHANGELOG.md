# @osdlc/repo-cleaner

## 0.6.1

### Patch Changes

- Updated dependencies [a4ca07d]
  - @osdlc/typed-gh@0.12.0

## 0.6.0

### Minor Changes

- bb61f10: `--version` prints the package version and exits 0.

### Patch Changes

- Updated dependencies [bb61f10]
  - @osdlc/cli-tool@0.11.0

## 0.5.2

### Patch Changes

- Updated dependencies [da5e6a3]
- Updated dependencies [da5e6a3]
- Updated dependencies [da5e6a3]
  - @osdlc/command-seam@0.14.0
  - @osdlc/typed-gh@0.11.0
  - @osdlc/typed-git@0.10.0
  - @osdlc/cli-tool@0.10.1

## 0.5.1

### Patch Changes

- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [fdef74f]
  - @osdlc/cli-tool@0.10.0
  - @osdlc/command-seam@0.13.0
  - @osdlc/config-layers@0.8.0
  - @osdlc/typed-gh@0.10.0
  - @osdlc/typed-git@0.9.0

## 0.5.0

### Minor Changes

- c3f0d1d: The first release of `@osdlc/repo-cleaner` on npm. It finds what has been merged into the default branch and can go away: local branches, worktrees and remote branches, across one repository or many.
  
  - `sweepRepo` and `sweepRepos` classify each item `safe-to-delete`, `safe-to-keep` or `needs-investigation`, with the evidence behind the verdict and the command that would act on it. A merged pull request whose head is the branch tip, or a tip reachable from `<remote>/<default>`, settles most items. A sweep deletes nothing.
  - `planRepo`, `writePlan`, `readPlan` and `applyPlan` write the deletable rows as a plan and apply the ones a person approves. Each delete is compare-and-swap on the judged sha, each step is verified, the first failure stops the run and a receipt records every step. Rows that need `abandon-unmerged`, `discard-changes` or `confirm-open-pr` are dropped without that grant.
  - The `repo-cleaner` command sweeps the repository you are in, or a path, or the repositories in `<config-home>/repo-cleaner/config.yaml` with `--all`. `repo-cleaner apply` applies a plan. The directories are named `repo-cleaner`, moved by the `REPO_CLEANER_*` environment variables.
  - ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. `git` is required; `gh` is optional and `--no-gh` skips it. Licence `MIT OR Apache-2.0`.
- b3b7ecc: A worktree lock held by a dead process no longer blocks removal, and a live process inside a worktree now does.
  
  - A lock reason with a `pid <N>` token (optionally `start <time>`) is read as an owner claim. When that process is dead, or its start time (a timestamp precise to the second) differs from the lock's, the lock is stale: the worktree gets `facts.stale_lock`, no `locked-worktree` blocker, and `apply` runs a new `unlock-worktree` step before the remove. It checks the owner and the directory again just before the unlock and the remove, and `stale_lock` is part of the worktree fingerprint. A lock with no `pid` token, or a live owner, still blocks.
  - A new `live-process` blocker covers any process other than an idle shell (`sh`, `bash`, `zsh`, `fish` with no child processes) whose working directory is inside the worktree. Idle shells are listed in `facts.idle_shells`. When the process table cannot be read, the worktree gets a `process-probe-failed` blocker instead.
  - New `ProcessProbe` port (`alive`, `holders`; `probe` is required on `gatherWorktrees` and `classifyWorktree`) with a default over `ps` and `lsof` run through `@osdlc/command-seam`. Pass `probe` to `sweepRepo`, `sweepRepos`, `applyPlan`, `gatherWorktrees` or `classifyWorktree` to replace it. Exports: `defaultProcessProbe`, `parseLockOwner`, `parseLsofCwd`, `isIdleShell`, `worktreeUnlockCommand` and the types.
  - The receipt's step `action` gains `unlock-worktree`. Uses `worktreeUnlock` from `@osdlc/typed-git`.

### Patch Changes

- Updated dependencies [7addea1]
- Updated dependencies [f013f38]
- Updated dependencies [3d6d087]
- Updated dependencies [f013f38]
  - @osdlc/cli-tool@0.9.1
  - @osdlc/command-seam@0.12.1
  - @osdlc/typed-gh@0.9.6
  - @osdlc/typed-git@0.8.2

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
