# @osdlc/repo-cleaner

## 0.11.0

### Minor Changes

- 14d4351: A worktree row whose directory is gone, or is no longer a checkout, now reads `prune` instead of `delete` in the report, and `summary` counts those rows in a `prune` column (and a `prune` count in each JSON bucket, a part of `safe-to-delete`). The row's `action` is `prune`.
  
  New `--remote-url <url>` on every sweeping command: sweep a remote's branches with no checkout of your own. The URL is cloned once (`--no-checkout`) under the cache directory and reused; deletes are pushed from that clone, so a plan written with `--remote-url` can be applied later from anywhere.

### Patch Changes

- Updated dependencies [14d4351]
- Updated dependencies [dd2265e]
  - @osdlc/cli-tool@0.13.0

## 0.10.1

### Patch Changes

- cde11b5: `apply` fixes:
  
  - The run a confirmation approves keeps the safe-to-delete guard: a row that turned into a review row between the preview and the yes is dropped as `needs-review`, not run.
  - Two clones of one remote no longer delete its branches twice. The second row is dropped as the new reason `duplicate`, naming the clone that deletes it; before, the second push was rejected and the run stopped with exit 11. Remotes are compared by the push URLs git uses (`url.*.insteadOf` applied), a network URL in any form (`git@host:o/r`, `ssh://`, `https://`) as `host/path`, and a local path as written.
  - A swept `apply` re-checks once before asking, from the sweep it just ran, instead of sweeping again; the run that deletes still sweeps afresh.
  - A run that deletes without a receipt file says so on stderr.
  - Every run ends with a summary: `deleted: 1 worktree, 3 local branches, 2 remote branches`, the dropped rows by reason, and how many rows a failed run did not reach. A preview says `would delete:`. `--output json` adds a `summary` object.
  - The prompt's `Delete N items?` counts rows, not steps: a stale-locked worktree is one item, not two.
  - `--repo-root` naming no repository in the plan exits 1 instead of reporting nothing to delete.
  - An empty plan's JSON receipt says `complete`, not `dry-run`, unless the run was `--dry-run`.
  
  Library: `ApplyOptions.safeOnly` and `ApplyOptions.swept`, the `duplicate` drop reason, `RECEIPT_VERSION`, and `summarizeReceipt`, `renderApplySummary` and `ApplySummary`.

## 0.10.0

### Minor Changes

- 6e4284b: **Breaking:** repo-cleaner no longer reads a config file. It sweeps the repository you are in, or the paths you pass, which can be directories holding checkouts. `--all` and `--config` are removed: pass the directories instead (`repo-cleaner ~/Developer ~/work`), or keep them in a shell alias. Removed from the library: `CONFIG_ENV`, `DEFAULT_CONFIG`, `RepoCleanerConfigSchema`, `TOOL`, `clearConfigCache`, `configPath`, `configuredRepos`, `loadConfig` and `RepoCleanerConfig`. `REPO_CLEANER_MACHINE_CONFIG` is no longer read. The package no longer depends on `@osdlc/config-layers`.
- 6e4284b: A status line on stderr while a run works: which repository (`[2/5]` in a run of several), and which step — reading the repository, fetching, listing pull requests (gh), checking worktrees, local or remote branches with a count (`37/427`) — and, in `apply`, the re-check and each delete step. It is drawn only when stderr is a terminal, erased before any other output, and turned off with `--no-progress`.
  
  Library: `SweepOptions.onProgress` receives a `SweepProgress` before each step and each item; `ApplyOptions.onSweepProgress` and `onStep` do the same for `applyPlan`.
- 6e4284b: New `repo-cleaner summary`: a table per repository counting local branches, worktrees and remote branches, with how many are merged into the default branch and how many the sweep would delete, review or keep. `--output json` gives the counts without the rows.
  
  Each row now records `facts.merged`: true when its work is on the default branch by ancestry, an exact-head merged PR or a patch match. A branch checked out in a worktree, or at HEAD, is judged by ancestry or PR alone. The default branch and the primary or current worktree carry none. `SummaryBucket` gains `merged`, so the JSON report's `summary` counts it too.
- 6e4284b: **Breaking:** the CLI is three commands over one set of sweep options, and `apply` asks before it deletes.
  
  - `repo-cleaner [status]` is the report, as before.
  - `repo-cleaner plan` writes the plan to stdout, or to a file with `-o <file>`. It replaces `--write-plan` and `--plan-out`. Plans no longer go to a hidden directory by default.
  - `repo-cleaner apply` sweeps and plans in memory, or reads `--plan <file>` (`-` reads stdin). With no `--row` it applies every row the re-check judges `safe-to-delete`, and drops a row to review with the new reason `needs-review`; name a review row with `--row` to apply it. It re-checks each row, prints the steps and asks `Delete N items? [y/N]`. `--yes` (`-y`) skips the question. With no terminal and no `--yes` it refuses with exit 2. `--plan -` needs `--yes` or `--dry-run`. On yes it runs only the steps it showed.
  - `--only worktrees,branches,remotes` replaces `--scope local-branches,worktrees,remote-branches`, and works on every command.
  - `--allow <risk>[=<category>:<id>]` replaces `--authorize`.
  - Receipts go beside a `--plan` file as `<plan>.receipt-<timestamp>.json`, or to `--receipt <file>`. `--receipt-dir` and the default receipts directory are removed. A run that swept, or read stdin, writes a receipt only with `--receipt`.
  
  Library: `applyPlan` with an empty row list selects every row of the plan and drops each one not judged `safe-to-delete` (`needs-review`), and `receiptPath` may be `null` to write no receipt. New `parsePlan(text, source)`. `stampedPath` is removed; use `fileStamp`.

### Patch Changes

- 6e4284b: A registered worktree whose directory still exists but whose `.git` is gone (git lists it as prunable) no longer makes the whole repository unreadable with `git status: This is not a git repository`. It is a `safe-to-delete` row whose command is `git worktree prune`, which drops the registration and leaves the directory; `facts.directory_left` is true.
- 6e4284b: `apply` fixes: a branch name two repositories share applies in both instead of failing as ambiguous; a repository the sweep could not read (such as a failed fetch) is named on stderr and exits 1 instead of reading as "nothing to delete", and `plan` does the same; the receipt file records the rows the preview dropped; a worktree's fingerprint includes `on_disk`, so a prune row whose directory came back is dropped rather than removed. The status line strips terminal controls from paths and fits wide characters to the terminal's width. A worktree's `facts.merged` counts a patch match the same way a branch's does.
  
  Library: `applyPlan` takes `RowSelection` rows (a row with an optional `repo`) and `ApplyOptions.dropped`.

## 0.9.3

### Patch Changes

- e0aaba5: A remote branch delete the remote refuses now fails its step with git's reason and what it means, such as `[remote rejected] (pre-receive hook declined): A hook on the remote refused the push.`, read from typed-git's per-ref push report instead of stderr.
- Updated dependencies [e0aaba5]
  - @osdlc/typed-git@0.12.0
  - @osdlc/typed-gh@0.14.1

## 0.9.2

### Patch Changes

- Updated dependencies [c58f58b]
  - @osdlc/typed-gh@0.14.0

## 0.9.1

### Patch Changes

- Updated dependencies [5598ee8]
- Updated dependencies [50a340a]
- Updated dependencies [65740a9]
  - @osdlc/typed-gh@0.13.0

## 0.9.0

### Minor Changes

- 43a4097: `pr-update dev` and `repo-cleaner dev` run the tool from a development checkout: `dev link <checkout>` makes the installed command run that checkout's source under Bun, `dev status` says which code runs, and `dev off` goes back. `PR_UPDATE_HOME` and `REPO_CLEANER_HOME` do the same for one run. `dev` is now a word for both tools: sweep a directory named `dev` with `repo-cleaner ./dev`, as with `apply`. The bin now loads `dist/bin.js`, built from the new `src/bin.ts`.

### Patch Changes

- Updated dependencies [43a4097]
  - @osdlc/cli-tool@0.12.0

## 0.8.0

### Minor Changes

- 7fe7f51: Output change: a remote on a host other than github.com is now named `host/owner/name` in the report, read with typed-git's `parseRemoteRepo`. Before, typed-gh read `owner/name` from any host, so one `owner/name` on two hosts was reported as a duplicate checkout. The `slug` field of `--output json` changes with it.

### Patch Changes

- Updated dependencies [7fe7f51]
  - @osdlc/typed-git@0.11.1

## 0.7.0

### Minor Changes

- 82d9841: A branch landed by rebase merge, cherry-pick or squash merge is now recognised without pull request data, and needs no grant when the content check agrees.
  
  - A third landing signal, patch equivalence, runs when a PR at the exact tip and ancestry both fail. It compares by `git cherry` patch id: commit by commit (`per-commit`), the branch squashed into one change (`squashed`), and, for a branch that moved on after a merged PR's head, that head squashed plus each later commit (`head-moved`). It applies to local branches, remote branches and worktrees.
  - A patch id is a heuristic, so a match alone still requires the `abandon-unmerged` authorization. A second check, `git merge-tree --write-tree` of the default branch and the tip (git 2.38 or later), must give the default branch's own tree to drop it; the outcome is in `facts.landing_content_confirmed` and the row's reason.
  - The row records `facts.landing = 'patch-equivalent'` and `facts.landing_check`. A branch that is only partly on the default branch lists the commits that are not in `facts.unmatched_commits` and in the investigation text.
  - It fails closed. A failing git call, unreadable output, a shallow clone, a missing merge base, an empty change, a merge commit in the range (for the commit-by-commit check), or any commit not on the default branch means the branch is not counted as landed.
  - The squashed check writes one unreferenced commit object and no ref, needs no git identity, and ignores `git replace` refs.
  - New exports: `assessLanding`, `patchEquivalent`, `Landing`, `LandingCheck`. Uses `cherry`, `commitTree` and `mergeTree` from `@osdlc/typed-git`.

### Patch Changes

- Updated dependencies [82d9841]
- Updated dependencies [ebe0e0d]
  - @osdlc/typed-git@0.11.0
  - @osdlc/typed-gh@0.12.1

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
