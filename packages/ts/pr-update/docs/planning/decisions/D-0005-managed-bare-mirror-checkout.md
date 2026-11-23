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

Accepted: a standalone run finds each `--repo` target in a checkout already on
the machine, and uses a managed bare clone only when there is none. The order
is the project root, then a checkout under the roots in
`~/.config/osdlc/repositories.yaml` (or, with none configured, beside the
project root), then the clone. The clone is not a
`git clone --mirror`: it keeps the `origin/<branch>` remote-tracking layout
that `survey` and `update` already read. The first `update --apply` that needs
a clone asks before making one, and the answer is saved in
`~/.config/osdlc/pr-update/config.yaml`. It is being built
(osdlc/osdlc#844). The `locate` parts rest on D-ZVIA, accepted 2026-11-23.

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
- `git clone --bare` copies the remote's branches into local `refs/heads/*`
  and writes no `remote.origin.fetch`. Left alone, those heads go stale and
  keep old objects from `gc`. Standard git.
- `gh repo clone` of a fork adds an `upstream` remote unless given
  `--no-upstream`. Verified (`gh repo clone --help`).
- `gh repo clone` authenticates only its own clone. The clone's config gets
  no credential helper, so on a machine that never ran `gh auth setup-git`, a
  later `git fetch` or `git push` over HTTPS fails with `could not read
  Username`. With `credential.https://github.com.helper` set to
  `!gh auth git-credential` in the clone's own config, both work. Verified
  2026-11-22 against a private repository, with global and system git config
  turned off (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`) and
  `push --dry-run`.
- `git worktree add --detach` works from a bare clone. Verified the same day,
  on a repository without submodules.
- `git worktree move` is a plain `rename()` with no copy fallback, so it fails
  with `Invalid cross-device link` when the source and target are on
  different filesystems. `keepWorktree` (`src/update/kept.ts`) moves the run
  worktree to its kept path. For non-root targets those are in the cache and
  state homes, which can be on different disks. Reproduced in review.
- `unpushed_local` asks `git worktree list` for a worktree on the head
  (`unpushedLocalWork` in `src/survey.ts`). A bare clone this tool owns has
  none, so the guard is false by construction there and never fires.
  Verified in code.
- `branch` mode reads the project-root checkout and does not apply to a managed
  clone (the issue says so).
- `attempts.store: git-ref` and the update lease are built once per run, on
  the project root's `--remote` and checkout (`standalonePorts` in
  `src/defaults.ts`). A second target's records and leases would land on the
  project root's remote. Verified in code.
- Trust is checked for the project root only (`src/commands.ts`). A second
  target's `verify: detect` or `lockfile_install` would run commands its own
  files choose, unchecked. Verified in code.
- `@osdlc/config-layers`' `machineConfigFile` places its file at
  `<config-home>/<tool>/<fileName>` through `standalone(tool).config()`, and
  derives its default relocation variable from `tool`. Without a `dirs`
  option it resolves under the native convention, so on macOS it lands in
  `~/Library/Application Support/`. It reaches a per-tool directory under a
  shared root only through a nested `fileName`, which skips segment
  validation. `@osdlc/tiered-dirs` has the validated form: `Dir.app(name)`.
  Verified (`machine.ts`, `tiered-dirs`). pr-update reads no machine file today.
- devlink keeps pr-update's `history.jsonl` and link file in
  `standalone('pr-update').config()`, pinned to the Xdg convention, which is
  `~/.config/pr-update/`. Verified (`cli-tool/src/devlink/state.ts`).
- `@osdlc/cli-tool` has synchronous `askText`, `askChoice`, `askYesNo` and
  `canPrompt` (`prompt.ts`). `--confirm-push` uses `askYesNo`. Verified.
- A command that would ask and cannot exits 2 and names the flag that answers
  instead (`standards/cli-interface.md`, section 7).

## Prior art

| System | What it does | Verdict |
| --- | --- | --- |
| `attempts.store: git-ref` here | Moves attempt records off the project root onto the remote | Adopt, once the store and lease are bound per target |
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

- **A. Bare clone with the remote-tracking layout (recommended).** Clone bare,
  delete the copied `refs/heads/*`, set
  `remote.origin.fetch=+refs/heads/*:refs/remotes/origin/*`, and fetch with
  `--prune`. Cost: one setup step and a custom refspec. Forecloses nothing.
  Scores: 1 yes, 2 yes, 3 yes, 4 yes, 5 yes.
- **B. `git clone --mirror`, as the issue words it.** Cost: a second ref layout
  threaded through survey, executor, leases and tests. Forecloses a single code
  path. Scores: 1 no, 2 yes, 3 yes, 4 yes (needs new push refspecs), 5 yes.
- **C. Normal (non-bare) managed clone.** Cost: a working tree to keep clean and
  disk per repository. Forecloses the cheap worktree. Scores: 1 yes, 2 yes,
  3 yes, 4 yes, 5 yes, but heavier.

## Owner answers (2026-11-21 and 2026-11-22)

- A managed local cache is wanted. Server-side updates with no clone at all
  were considered and not taken.
- The first-run prompt is the opt-in. Nobody has to set a mode first.
- With no terminal to ask on and nothing configured, the run fails. It does not
  clone into the default directory unasked.
- `checkout` and the cache location are machine keys, in one file per tool
  under a shared `osdlc` root.
- Project-level config stays where it is: `pr-update.yaml` and its `.local`
  overlay for a standalone run, the `pr_update:` block of `sdlc.yaml` under sdlc.
- Option A over the issue's literal `--mirror`.
- Clone through `gh repo clone`.
- File attempts for cloned targets get their own store. Requiring `git-ref`
  instead is backlogged as
  [B-0003](../backlog/B-0003-require-git-ref-attempts-for-mirror-targets.md).
- Old clones must not pile up: they are pruned by age automatically, and by
  hand with `mirror prune`.
- An existing checkout is used wherever one can be found, so the standalone
  `locate` is part of this record. Where checkouts live is shared by every
  osdlc tool, so it is read from `~/.config/osdlc/repositories.yaml`
  ([D-ZVIA](../../../../../../docs/decisions/D-ZVIA-osdlc-ecosystem-package.md)).
- No "mirror only" value now. Backlogged as
  [B-0002](../backlog/B-0002-a-mirror-only-checkout-value.md).
- Only `update --apply` makes clones. `survey` and rehearsals use a clone that
  exists, and otherwise report the repository as not measured.
- The trust gate runs for every target, not only the project root.
- A located checkout's run worktree goes under pr-update's cache, not inside
  the checkout.

## Decision

Option A. B lost on criterion 1, C on cost and the guard. Details to build:

- **Scope.** The standalone binary only: its `standalonePorts` gets the new
  `locate`, and it alone prompts and reads the machine file. A host's `Ports`
  are unchanged, and whether sdlc offers the cache is a later choice.
- **Directories.** Every path below comes from `standalone('osdlc')` with
  `envVars('OSDLC')`, pinned to the Xdg convention as devlink pins it, then
  `.app('pr-update')`. `OSDLC_ROOT` moves all of it
  ([machine-files.md](../../../../../../standards/machine-files.md)). The
  table and the paths elsewhere in this record are the Linux and macOS
  defaults. The `XDG_*` and `OSDLC_*` variables move them, and Windows uses
  `%APPDATA%` and `%LOCALAPPDATA%`
  ([Where files go](../../../../../../standards/machine-files.md#where-files-go)).
  devlink's
  `PR_UPDATE_*` variables keep covering only its own files in
  `~/.config/pr-update/`.

  | What | Home | Default path on Linux and macOS |
  | --- | --- | --- |
  | Machine file | config | `~/.config/osdlc/pr-update/config.yaml` |
  | Clones | cache | `~/.cache/osdlc/pr-update/repos/<host>/<owner>/<name>.git` |
  | Run worktrees of non-root targets | cache | `~/.cache/osdlc/pr-update/worktrees/<host>/<owner>/<name>/<run>` |
  | Kept worktrees of non-root targets | state | `~/.local/state/osdlc/pr-update/kept/<host>/<owner>/<name>/<number>` |
  | File attempts of non-root targets | state | `~/.local/state/osdlc/pr-update/attempts/` |

  Every per-repository path of a non-root target is lower-cased and carries
  the host. A non-root target's `host/owner/name` is lower-cased once, when
  the target is resolved, and every clone, kept and attempt lookup compares
  that form, so `Acme/API` and `acme/api` are one target. For those targets
  `keptName` and `findKept` (`src/update/kept.ts`) use that layout and match
  on host as well as repository. No non-root
  target has a kept worktree today, so nothing needs to move.

  The same repository can be served from different git repositories on
  different runs: one located checkout, another, or the clone. So a kept
  record of a non-root target also stores the git directory that owns the
  worktree (`git rev-parse --git-common-dir`). Discarding, by hand or because
  the PR moved, goes through that git directory, not the one serving the
  run. When that directory is gone, it removes only the kept directory and
  record. `--retry-failed` uses a kept worktree only when the run is served
  from its owner. Otherwise the run names the kept worktree and its owner,
  leaves both alone, and skips the PR with reason `kept elsewhere`.

  A non-root target's run worktree (cache) and kept worktree (state) can be
  on different filesystems, where `git worktree move` fails (facts above).
  Then keeping falls back to `git worktree add` at the kept path from the run
  worktree's `HEAD`, copies the verify log in, and removes the run worktree.
  The kept tree has the same commit and log; untracked build output is not
  carried over. The run worktree stays until the keep has fully succeeded.
  If a later keep step fails, the rollback is `git worktree remove --force`
  of the kept path and deleting its branch, not a move back.

  Kept worktrees and attempt records are not cache: a person may have work to finish in one,
  and the other is history nothing re-derives. The project root keeps today's
  `<projectRoot>/.pr-update/` for its run worktrees, kept worktrees and
  attempt records, and today's
  `<owner>-<name>-<number>` kept name, so worktrees already kept there are
  still found.
- **Machine file.** Read and written with `machineConfigFile`, which gets an
  `app` option first (a config-layers change), and is passed the pinned
  `dirs`. Its relocation variable is `PR_UPDATE_MACHINE_CONFIG`, named
  explicitly, because the default, `OSDLC_MACHINE_CONFIG`, would be shared by
  every osdlc tool. `PR_UPDATE_CONFIG` still moves only the project file.
  Keys:
  - `checkout: local | mirror`. Unset until the person answers. Both use the
    project root and `locate`. `mirror` adds the clone as the fallback.
    `local` never clones: a target with no checkout is skipped. A stricter
    "mirror only" value is deferred (B-0002).
  - `mirror_dir: <path>`, optional.
  - `mirror_max_age_days: <n>`, default 30. It applies only to whole clones.
    `0` turns automatic pruning of clones off, and a bare `mirror prune` then
    removes no clone unless given `--older-than` or `--all`. Dead run
    worktrees are removed either way.

  None of these keys is in the project schema, so neither `pr-update.yaml` nor
  its `.local` overlay can set them. A repository cannot choose where the tool
  writes on a person's disk.
- **Finding existing checkouts.** `locate` is `locateCheckout` from
  `@osdlc/ecosystem` (D-ZVIA). It reads `roots` from `repositories.yaml` and
  matches each checkout's `origin`. With no roots it scans the directory that
  holds the project root's main checkout, or the one above it when that
  directory is named after the project root's own owner (an `<owner>/<name>`
  layout). It never steps to or above the person's home directory.
  Rules:
  - Each match resolves to its main checkout and is counted once. Linked
    worktrees are not separate checkouts.
  - `unpushed_local` reads `git worktree list` in every matching checkout, not
    only the first.
  - A shallow checkout is skipped: it cannot measure drift.
  - The run builds one index of the roots and resolves every target once,
    shared by the two target resolutions an `update` makes (`survey` and the
    executor).
  - A located checkout is fetched and pushed through `origin`, the remote that
    matched, whatever `--remote` says. `--remote` applies to the project root.
  - Its run worktree goes under the cache (table above). Inside the checkout
    the run writes only git's worktree records, its scratch branch and the
    fetched `origin/*` refs. A killed run leaves its worktree and scratch
    branch until pruning (below) or a later run on the same checkout removes
    them.
- **Who clones.** Only `update --apply`, with `checkout: mirror` or a consent
  below. `survey` and a rehearsal fetch a clone that exists and otherwise
  report the target as not measured, naming `pr-update mirror enable`. They
  take the clone's lock for the fetch and write the clone's last-used stamp,
  so a clone only surveyed is not pruned as unused. They prune nothing.
  So `survey` writes nothing but its fetches (into a clone or a located
  checkout's `origin/*`), the clone's stamp and the clone's lock file.
- **Consent.** Any one of these is consent to clone for the run: `--mirror-dir
  <dir>`, `PR_UPDATE_MIRROR_DIR`, or `checkout: mirror`. `--mirror-dir` and
  the variable win over `checkout: local` for that run. `OSDLC_ROOT` and the
  home variables are not consent: tests set them.
- **Location of clones**, first match wins:
  1. `--mirror-dir <dir>`;
  2. `PR_UPDATE_MIRROR_DIR`;
  3. `mirror_dir` in the machine file;
  4. `repos/` in the cache home (table above).

  One `<host>/<owner>/<name>.git` each, lower-cased. The host keeps an
  Enterprise `acme/api` apart from github.com's, and separate segments keep
  `a-b/c` apart from `a/b-c`.
- **First use asks.** The prompt runs in `update --apply` when a GitHub
  target has no checkout and nothing above gives or refuses consent. A target
  the clone cannot serve (below) never prompts. It names the
  repositories, the roots it searched and `repositories.yaml`, the clone
  directory, the expected size (`gh repo view --json diskUsage`), and that
  working trees are never touched. Answers:
  - Enter writes `checkout: mirror`, and no `mirror_dir`, so the default
    location can still change.
  - A typed path writes `checkout: mirror` and `mirror_dir`. It is expanded
    and made absolute, then checked as clone step 1 checks every location.
  - `n` writes `checkout: local`, so the question does not come back.

  The run prints the machine file's path. A write that loses a race to
  another run's prompt re-reads the file and uses the answer it finds.
- **No terminal.** When `canPrompt()` is false, a GitHub target has no
  checkout, and nothing gives or refuses consent, `update --apply` exits 2
  and names `--mirror-dir`, `PR_UPDATE_MIRROR_DIR` and
  `pr-update mirror enable`. This changes one case:
  an unattended `--apply` whose `--repo` has no checkout now fails instead of
  skipping it. `checkout: local` restores the skip. The nightly
  `pr-update.yml` never reaches this: it updates only the repository it
  checks out.
- **`pr-update mirror`.** The prompt's answers are also commands, as
  `cli-interface.md` section 8 asks:
  - `enable [--dir <dir>]` writes `checkout: mirror` and, with `--dir`,
    `mirror_dir`, after checking it as clone step 1 does;
  - `disable` writes `checkout: local`;
  - `list` shows each clone's repository, size, last use and kept worktrees;
  - `prune`, below.
- **Clone.** GitHub only. A bare `owner/name` means a repository on the
  project root's host when that is GitHub (github.com or Enterprise, cloned as
  `host/owner/name`), else github.com. A Forgejo target with no checkout is
  skipped with a message, as today. Steps:
  1. check the mirror directory, whichever location it came from: it must
     not be inside a git working tree, and must be missing, empty or already
     marked by this tool. Otherwise the run exits 2 and names the directory,
     having written nothing. Then write the tool's marker at its root if it
     is not there yet, create-if-absent, so two runs marking a new directory
     at once do not fail each other's check;
  2. take the clone's lock (`@osdlc/file-lock`), the file
     `<host>/<owner>/<name>.git.lock` beside the clone, so it exists before
     the clone does and survives the rename and the clone's removal;
  3. `gh repo clone <host/owner/name> <tmp> --no-upstream -- --bare`, where
     `<tmp>` is `.tmp-<name>.git-<pid>` beside the final directory (git
     needs an empty or missing target, so nothing is written there first);
  4. in the clone's own config, set `credential.https://<host>.helper` to an
     empty value and then to `!gh auth git-credential`, the two lines
     `gh auth setup-git` writes, so the fetch in step 6 and later fetches and
     pushes authenticate whatever the person's global git config holds;
  5. set `core.longpaths=true` (Windows paths under the cache are deep);
  6. delete every `refs/heads/*`, set the fetch refspec, fetch with `--prune`;
  7. write the clone's stamp and marker, then rename into place.

  A step that fails removes `<tmp>`, and the target is skipped with the
  error.
- **Trust.** The trust gate runs for each target before a command its own
  files choose (`verify: detect`, `lockfile_install`). A located checkout is
  keyed by its path, as the project root is. A clone is keyed by
  `host/owner/name`, with the host's port left out, as trust-repo's
  repository keys take it (`pr-update trust host/owner/name` records one).
  `--trust` covers every target of the run. An untrusted
  target is skipped with reason `untrusted`, and the run goes on with the
  others.
- **Attempts and the lease, per target.** The run's attempt store and lease
  route by repository:
  - The project root keeps today's store, `--remote` and lease.
  - `git-ref` for any other target is bound to that target's checkout or
    clone and its `origin`.
  - `file` for any other target is the state store (table above), one file
    per `host/owner/name`, head and base, whether the target is located or
    cloned. `clear` and `prune`
    route the same way.
- **Branch mode.** `branch` mode skips non-root targets.
- **Report.** Each repository in the JSON report carries
  `checkout: { path, source: root | located | clone }`. A run that serves a
  repository from a clone prints `<repo>: no checkout under <roots>; using the
  clone` every time.
- **Cleanup.** What removes what:

  | Item | Removed by |
  | --- | --- |
  | A run's worktree and scratch branch | The run, in a `finally` (`src/update/execute.ts`). A killed run's are removed by the next run served from the same git directory, or by pruning (below) |
  | A killed run's worktree under `worktrees/` in the cache | Pruning, automatic or by hand, whatever repository it belongs to |
  | A kept worktree (`keep_failed`) | `--discard-kept`, `--retry-failed`, or the PR moving |
  | `origin/<branch>` for a deleted branch | `fetch --prune`, on each unscoped run that fetches |
  | Unreachable objects | git's automatic `gc` |
  | A whole clone the person no longer targets | Automatic pruning by age, or `pr-update mirror prune` |

  Neither macOS nor common Linux setups clear `~/.cache` on their own, so
  without pruning the cache keeps one clone for every repository a run ever
  targeted.
- **Pruning clones.** An `update --apply` holds a clone's lock from its clone
  or fetch through its `git worktree add`, as one step, and again for
  `worktree remove`. It writes the last-used stamp when it first takes the
  lock. It waits up to 60 seconds for the lock, then skips the target with
  reason `mirror busy`. Between those steps the clone is in use through the
  run's worktree, which git records in the clone. Pruning takes
  the lock without waiting and holds it through the stamp check and the
  removal, and removes the lock file last. Under the lock, pruning first removes worktrees whose run is dead (the
  executor's existing check), then skips a clone that still has any. A clone
  or temporary directory whose lock it cannot take is skipped. A clone
  directory without the tool's marker was not made by this tool and is never
  removed. A `.tmp-*.git-<pid>` directory is recognised by its name instead,
  inside a mirror directory that carries the tool's marker (clone step 1), so
  one left by a killed clone is removed.

  Pruning also walks `worktrees/` in the cache, which holds the run
  worktrees of located checkouts as well as clones. A directory whose run is
  dead (the same pid check) is removed. First its `.git` file is read: it
  names `<common-dir>/worktrees/<id>`, whose `commondir` file gives the
  owning git directory. Then the directory is removed, and when the owner
  still exists, pruning runs `git worktree prune` there and deletes the dead
  run's scratch branch.
  `mirror list` shows these directories too, so a deleted or no-longer-targeted
  checkout leaves nothing behind in the cache. This walk ignores the age
  setting.
  - *Automatic.* At the end of an `update --apply` that served a target from
    a clone or wrote under `worktrees/`, the run walks `worktrees/` and
    removes clones whose stamp is older than `mirror_max_age_days`. It prints
    each one removed and the space freed. A run that never touches the cache
    never removes anything.
  - *By hand.* `pr-update mirror prune` walks `worktrees/` and removes clones
    past the age (none with the age at `0`, unless `--older-than` or `--all`
    is given).
    `--older-than <days>` overrides it, `--all` takes every clone,
    `--dry-run` only reports. It and `list` take `--mirror-dir`, so a
    directory left behind by a moved `mirror_dir` can be cleaned.
  - *Never removed:* a clone whose lock another process holds, or one with a
    kept worktree, even with `--all`. `mirror prune --discard-kept` removes
    the kept worktrees first.
  - Removing a clone leaves its repository's attempt records in the state
    home. They are history, not cache, and later runs that reach the
    repository from outside it, located or cloned, read them.

## Consequences

- Touches `src/defaults.ts` (`locate`, per-target store and lease),
  `src/survey.ts` (target resolution, descriptions, the report's `checkout`
  field), `src/update.ts` (worktree and kept roots), `src/commands.ts` (flag,
  variable, prompt, per-target trust), a new machine-file module, a new
  `mirror` command, the exit codes table and `README.md`. About 700 non-test
  lines, estimated. Before it: config-layers' `machineConfigFile` gets its
  `app` option, `typed-git` gains SSH-alias-aware remote matching (moved
  from sdlc), `@osdlc/ecosystem` ships `repositories.yaml` and
  `locateCheckout` on top of it (D-ZVIA), and trust-repo keys a clone by
  repository.
  Does not supersede D-0001..D-0004.
- **Known limit: unpushed work in a checkout the tool cannot see.** A
  repository checked out outside every root still runs from the clone.
  `unpushed_local` cannot fire there, and `--force-with-lease` guards only
  against changes on the remote. A run can therefore force-push over a branch
  whose local checkout holds commits that were never pushed. The README states
  this next to the mode, and the run's notice names the searched roots so a
  missed one is visible.
- **`file` attempt records are per entry point.** A run started inside a
  repository reads and writes `<projectRoot>/.pr-update/attempts`. A run that
  reaches the same repository with `--repo` reads and writes the state store.
  Neither sees the other's records, so a PR skipped from one may be retried
  from the other. This keeps criterion 5. `git-ref` shares records across
  both, and across machines (B-0003).
- pr-update keeps state under two roots for a while: everything above under
  `osdlc/pr-update/`, and devlink's files and the trust store
  (`$XDG_STATE_HOME/pr-update/trusted/`) under `pr-update/`. Each category lives
  in one place, and the others can move over one at a time.
- A host that builds one attempt store or lease for several repositories has
  the same problem the facts name for `git-ref`. That is outside this record.

## Follow-ups

- A machine target for `pr-update config set`, in cli-tool's `config-command.ts`
  so every tool gets it. `pr-update mirror enable` and `disable` cover the
  `checkout` and `mirror_dir` keys until then.
- Move devlink's files and the trust store under `osdlc/pr-update/`, or keep
  them where they are on purpose. The trust store first needs to resolve
  through tiered-dirs, with an `app` option (osdlc/osdlc#1010). Its markers
  stay keyed by `pr-update`, never by `osdlc`, so consent given to pr-update
  covers no other osdlc tool.
- Project config at `<repo>/.osdlc/pr-update.yaml` instead of `pr-update.yaml`
  at the root. No repository commits a `pr-update.yaml` today, so the move would
  break no one, but it is not part of this record.

## What would reopen it

A host where `gh repo clone` cannot authenticate, or where the clone-local
helper does not authenticate later fetches and pushes; evidence that
`git worktree add` from a bare clone misbehaves with this tool's submodule
handling; or an owner need for a literal `--mirror` push of all refs.
