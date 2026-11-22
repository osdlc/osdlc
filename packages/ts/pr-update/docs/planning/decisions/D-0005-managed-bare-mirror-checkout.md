---
type: decision
schema_version: '2'
id: D-0005
title: Run without a local checkout from a managed bare clone
state: open/accepted
created: '2026-11-19'
last_reviewed: '2026-11-22'
tags:
  - pr-update
  - checkout
  - mirror
---
# Run without a local checkout from a managed bare clone

## Summary

Accepted: a standalone run keeps one bare clone per repository under a cache
directory, and uses it for a `--repo` that has no local checkout. The clone is
not a `git clone --mirror`: it keeps the `origin/<branch>` remote-tracking
layout that `survey` and `update` already read. The project root and `locate`
stay first, and the clone is the fallback. The first run that needs a clone
asks before making one, and the answer is saved in a machine file,
`~/.config/osdlc/pr-update/config.yaml`. The owner answered every question on
2026-11-21 and 2026-11-22. Nothing is built yet (osdlc/osdlc#844).

^summary

## Context

`Ports.locate(repo)` returns a local checkout or null. A standalone run's
`locate` is `() => null` (`src/defaults.ts`), so every `--repo` other than the
project root is reported `no local checkout — drift not measured`
(`src/survey.ts`) and `update` skips it. The update worktree is made at
`<checkout>/.pr-update/<run>` (`src/update.ts`), and file-store attempts live in
`<projectRoot>/.pr-update/attempts` (`src/update/attempts.ts`). Verified in code.

A host that supplies its own `Ports` also supplies its own `locate`. sdlc's
scans the directories its `repos:` lists name and matches each checkout's
`origin`. Nothing in this record changes a host's `locate`.

## Facts the choice rests on

- Drift reads `origin/<base>` and `origin/<head>` (`measure` in
  `src/survey.ts`, `remote` argument). A `git clone --mirror` has no
  `refs/remotes/origin/*`: it maps `refs/*` onto itself, so branches are
  `refs/heads/*`. Reading it as is would need a second ref layout in `measure`,
  `scopedRefspecs`, the executor's fetch and push, and the lease and attempt
  refs. Verified by reading the code; the mirror layout is standard git.
- `git worktree add` works from a bare repository. Inferred; to confirm in the
  build with a test.
- `unpushed_local` asks `git worktree list` for a checkout of the head. A bare
  clone this tool owns has none, so it is true by construction. Verified in code.
- `branch` mode reads the project-root checkout and does not apply to a managed
  clone (the issue says so).
- `attempts.store: git-ref` keeps records as refs on the remote, so it needs no
  project root. Verified (`ref-attempts.ts`).
- `@osdlc/config-layers`' `machineConfigFile` places its file at
  `<config-home>/<tool>/<fileName>` through `standalone(tool).config()`, and
  derives its default relocation variable from `tool`. It reaches a per-tool
  directory under a shared root only through a nested `fileName`
  (`'pr-update/config.yaml'`), which skips segment validation.
  `@osdlc/tiered-dirs` has the validated form: `Dir.app(name)`. Verified (`machine.ts`,
  `tiered-dirs.ts`). pr-update reads no machine file today.
- devlink already keeps pr-update's `history.jsonl` and link file in
  `standalone('pr-update').config()`, which is `~/.config/pr-update/`. Verified
  (`cli-tool/src/devlink/state.ts`).
- `@osdlc/cli-tool` has synchronous `askText`, `askChoice` and `canPrompt`, the
  helpers `--confirm-push` uses (`src/update/confirm.ts`). Verified.

## Prior art

| System | What it does | Verdict |
| --- | --- | --- |
| `attempts.store: git-ref` here | Moves state off the project root onto the remote | Adopt: it already works in this mode and needs nothing |
| `ports.locate` here | Host-owned resolution of a repo to a path | Adopt: stays first, the clone is its fallback |
| `git clone --mirror` (git docs) | Bare clone, refs mapped `refs/*` to `refs/*` | Reject as the layout: breaks the `origin/*` reads. Keep the bare, bounded-cost idea |
| Renovate's repository cache (renovatebot.com docs, inferred from memory, not re-read) | One managed clone per repository in a cache dir, fetched each run | Borrow: cache directory, fetch-or-clone on first use |

## Criteria

1. The engine's ref reads and pushes change in no place (smallest diff).
2. The run never touches a developer's working tree.
3. Standalone: needs no host registry, and works from a fresh machine.
4. The push keeps `--force-with-lease` against the head the run read.
5. Existing file-store users see no change.

## Options

- **A. Bare clone with the remote-tracking layout (recommended).** First use:
  `git clone --bare <url> <dir>`, then set
  `remote.origin.fetch=+refs/heads/*:refs/remotes/origin/*` and fetch with
  `--prune`. Cost: one setup step and a custom refspec. Forecloses nothing.
  Scores: 1 yes, 2 yes, 3 yes, 4 yes, 5 yes.
- **B. `git clone --mirror`, as the issue words it.** Cost: a second ref layout
  threaded through survey, executor, leases and tests. Forecloses a single code
  path. Scores: 1 no, 2 yes, 3 yes, 4 yes (needs new push refspecs), 5 yes.
- **C. Normal (non-bare) managed clone.** Cost: a working tree to keep clean and
  disk per repository. Forecloses the cheap worktree and the trivial
  `unpushed_local`. Scores: 1 yes, 2 yes, 3 yes, 4 yes, 5 yes, but heavier.

## Owner answers (2026-11-21 and 2026-11-22)

- A managed local cache is wanted. Server-side updates with no clone at all
  were considered and not taken.
- The first-run prompt is the opt-in. Nobody has to set a mode first.
- With no terminal to ask on and nothing configured, the run fails. It does not
  clone into the default directory unasked.
- `checkout` and the cache location are machine keys, in one file per tool
  under a shared `osdlc` root. Each tool owns a directory there, so the file
  is `~/.config/osdlc/pr-update/config.yaml` and the cache sits under
  `~/.cache/osdlc/pr-update/`.
- Project-level config stays where it is: `pr-update.yaml` and its `.local`
  overlay for a standalone run, the `pr_update:` block of `sdlc.yaml` under sdlc.
- Option A, a bare clone with the remote-tracking layout, over the issue's
  literal `--mirror`.
- Clone through `gh repo clone`.
- File attempts go in a store in the mirror directory. Requiring `git-ref` in
  this mode is backlogged as [B-0003](../backlog/B-0003-require-git-ref-attempts-for-mirror-targets.md).
- No "mirror only" value now. Backlogged as [B-0002](../backlog/B-0002-a-mirror-only-checkout-value.md).

## Decision

Option A. B lost on criterion 1, C on cost and the guard. Details to build:

- **Scope.** The standalone binary only: its `standalonePorts` gets the new
  `locate`, and it alone prompts and reads the machine file. A host's `Ports`
  are unchanged, and whether sdlc offers the cache is a later choice.
- **Machine file.** `~/.config/osdlc/pr-update/config.yaml` on Linux, and on
  macOS under the Xdg convention: `standalone('osdlc').config().app('pr-update')`,
  with the `vendorDirs` `src/devlink.ts` already uses. `machineConfigFile` gets
  an `app` option first (a config-layers change), rather than a nested
  `fileName`. The
  relocation variable is `PR_UPDATE_MACHINE_CONFIG`, named explicitly, because
  the default, `OSDLC_MACHINE_CONFIG`, would be shared by every osdlc tool.
  Keys:
  - `checkout: local | mirror`. Unset until the prompt answers it. `mirror`
    means project root and `locate` first, the clone as the fallback. `local`
    means today's behaviour: a repository with no checkout is skipped. A
    stricter "mirror only" value waits for a standalone `locate` (B-0002).
  - `mirror_dir: <path>`, optional.

  Neither key is in the project schema, so neither `pr-update.yaml` nor its
  `.local` overlay can set them. A repository cannot choose where the tool
  writes on a person's disk, which also keeps these keys out of the trust gate.
- **Location**, first match wins:
  1. `--mirror-dir <dir>`, for one run;
  2. `PR_UPDATE_MIRROR_DIR`, for CI and tests;
  3. `mirror_dir` in the machine file;
  4. `repos/` under `standalone('osdlc').cache().app('pr-update')`, which is
     `~/.cache/osdlc/pr-update/repos`.

  One `<owner>/<name>.git` each. (`<owner>-<name>` would let `a-b/c` and
  `a/b-c` share a directory.) A flag or the variable is consent for that run and
  skips the prompt.
- **First use asks.** The prompt runs when a target has no checkout from the
  project root or `locate`, and the machine file has no `checkout`. It does not
  run at install or on a run whose targets all have checkouts. It names the
  repositories, the directory, the expected size (`gh repo view --json
  diskUsage`), and that working trees are never touched. The answers are:
  Enter for the shown directory, a typed path, or `n`. The answer is written to
  the machine file through `MachineConfigFile.write`, and the run prints the
  file's path. `n` writes `checkout: local`, so the question does not come
  back. A typed path is expanded and made absolute. A path inside a git working
  tree is refused, and so is a directory that has other files in it and no
  marker file this tool wrote. A missing directory is created.
- **No terminal.** When `canPrompt()` is false and nothing above decides, the
  run fails with its own exit code (as the trust refusal has 21). The message
  names `--mirror-dir`, `PR_UPDATE_MIRROR_DIR` and the machine file's keys.
  This changes today's behaviour for one case: an unattended run whose `--repo`
  has no checkout now fails instead of succeeding with that repository skipped.
  `checkout: local` in the machine file restores the skip. A run whose targets
  all have checkouts never reaches this. That includes the nightly
  `pr-update.yml`, which updates only the repository it checks out.
- **Clone URL.** The remote URL of the project-root checkout cannot serve other
  repositories. Use `gh repo clone <owner/name> <dir> -- --bare`, the
  authenticated path `gh` already provides (the tool requires `gh`).
- **Worktrees and attempts.** `.pr-update/<run>` goes inside the bare clone's
  directory. With `attempts.store: file` in this mode the store lives in the
  mirror directory, one per cache, keyed by repo in each record; `git-ref` is
  unchanged. B-0003 holds the simpler alternative: require `git-ref` here.
- **Branch mode.** `branch` mode skips mirror targets.
- **Cleanup.** What removes what:

  | Item | Removed by |
  | --- | --- |
  | A run's worktree and scratch branch | The run, in a `finally` (`src/update/execute.ts`). A killed run's are removed by the next run |
  | A kept worktree (`keep_failed`) | `--discard-kept`, `--retry-failed`, or the PR moving. It sits at `<clone>/.pr-update/failed/`, so the run prints its path |
  | `origin/<branch>` for a deleted branch | `fetch --prune`, each run |
  | Unreachable objects | git's automatic `gc` |
  | A whole clone the person no longer targets | Nothing yet. `mirror prune` is a follow-up. Deleting a clone by hand works: the next run clones again. It also deletes any kept worktree inside it and, for the whole directory, the file attempts store |

  Neither macOS nor common Linux setups clear `~/.cache` on their own.

## Consequences

- Touches `src/defaults.ts` (`locate`), a new machine-file module, `src/commands.ts`
  (flag, variable, prompt), `src/update.ts` (worktree and attempts root) and
  `README.md`. About 350 non-test lines with the prompt, estimated. Before it,
  config-layers' `machineConfigFile` gets its `app` option. Does not supersede
  D-0001..D-0004.
- **Known limit: unpushed work in a checkout the tool cannot see.** A
  standalone `locate` finds nothing, so a repository the person has cloned
  somewhere still runs from the cache. `unpushed_local` is true by construction
  there, and `--force-with-lease` guards only against changes on the remote. A
  run can therefore force-push over a branch whose local checkout holds commits
  that were never pushed. The README states this next to the mode.
- pr-update keeps state under two roots for a while: the machine file and the
  cache under `osdlc/pr-update/`, and devlink's files and the trust store
  (`$XDG_STATE_HOME/pr-update/trusted/`) under `pr-update/`. Each category lives
  in one place, and the others can move over one at a time.

## Follow-ups

- A standalone `locate` that finds existing checkouts, sharing sdlc's `repos:`
  scan from an osdlc package. It reuses checkouts the person already has and
  narrows the unpushed-work limit above.
- A machine target for `pr-update config set`, in cli-tool's `config-command.ts`
  so every tool gets it. Until then the file is edited by hand or rewritten by
  the prompt.
- Move devlink's files and the trust store under `osdlc/pr-update/`, or keep
  them where they are on purpose. The trust store first needs to resolve
  through tiered-dirs, with an `app` option (osdlc/osdlc#1010). Its markers
  stay keyed by `pr-update`, never by `osdlc`, so consent given to pr-update
  covers no other osdlc tool.
- Project config at `<repo>/.osdlc/pr-update.yaml` instead of `pr-update.yaml`
  at the root. No repository commits a `pr-update.yaml` today, so the move would
  break no one, but it is not part of this record.
- `pr-update mirror list` and `mirror prune`. Until then, a moved `mirror_dir`
  leaves the old directory behind, and the run prints its path.

## What would reopen it

A host where `gh repo clone` cannot authenticate; evidence that
`git worktree add` from a bare clone misbehaves with this tool's submodule
handling; or an owner need for a literal `--mirror` push of all refs.
