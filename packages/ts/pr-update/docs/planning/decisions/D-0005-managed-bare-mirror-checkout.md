---
type: decision
schema_version: '2'
id: D-0005
title: Run without a local checkout from a managed bare clone
state: open/accepted
created: '2026-11-19'
last_reviewed: '2026-11-23'
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
`~/.config/osdlc/pr-update/config.yaml`. The `locate` parts rest on D-ZVIA,
accepted 2026-11-23.

Built in the omnibus [#1016](https://github.com/osdlc/osdlc/pull/1016), for
[#844](https://github.com/osdlc/osdlc/issues/844) and
[#1010](https://github.com/osdlc/osdlc/issues/1010). `update --apply` updates
a `--repo` target in a checkout found on the machine, or in a managed clone it
makes with consent; `survey` measures either; `pr-update mirror` has `enable`,
`disable`, `list` and `prune`; the trust store lives under `osdlc/pr-update/`.
Under it are config-layers' `app` option
([#1056](https://github.com/osdlc/osdlc/pull/1056)), typed-git's remote
matching ([#1055](https://github.com/osdlc/osdlc/pull/1055)), trust-repo's
store through tiered-dirs ([#1057](https://github.com/osdlc/osdlc/pull/1057))
and its repository keys, and `@osdlc/ecosystem`
([#1058](https://github.com/osdlc/osdlc/pull/1058)). What the build settled
that this record left open, and where it differs, is under Build notes.

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
  | File attempts of non-root targets | state | `~/.local/state/osdlc/pr-update/attempts/<host>/<owner>/<name>/` |

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
    removes no clone unless given `--older-than` or `--all-clones`. Dead run
    worktrees are removed either way. (changed during the build: Build note 1)

  None of these keys is in the project schema, so neither `pr-update.yaml` nor
  its `.local` overlay can set them. A repository cannot choose where the tool
  writes on a person's disk.
- **Finding existing checkouts.** `locate` is `locateCheckout` from
  `@osdlc/ecosystem` (D-ZVIA). It reads `roots` from `repositories.yaml` and
  matches each checkout's `origin`. With no roots it scans the directory that
  holds the project root's main checkout, or the one above it when that
  directory is named after the project root's own owner (an `<owner>/<name>`
  layout). It never steps above the person's home directory: a project root
  directly in home uses home, and one that is home itself gets no default root.
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
  - Its run worktree goes under the cache (table above). The checkout's
    working tree, index and HEAD are never touched. Its git directory gets
    git records only, listed in full under Build notes, with what a killed
    run leaves there. A later run on the same checkout removes a killed
    run's worktree and scratch branch, or pruning (below) does. (changed during the build: Build note 1)
  - Every git call in the checkout and its run worktrees runs with hooks off
    (`core.hooksPath=/dev/null`). The worktree holds the PR's own files, so
    a relative `core.hooksPath` such as `.husky` would run hooks the PR's
    author wrote. (added during the build: Build note 1)
- **Who clones.** Only `update --apply`, with `checkout: mirror` or a consent
  below. `survey` and a rehearsal fetch a clone that exists and otherwise
  report the target as not measured, naming `pr-update mirror enable`.
  `survey` takes the clone's lock without waiting and holds it while it
  fetches and reads the clone, so a prune cannot remove it part-way. When
  another run holds the lock, `survey` reads the clone as it is without one;
  if the clone is gone after that read (a prune held the lock), what was read
  is dropped and the target is reported not measured, with a note. A
  rehearsal holds it as `update --apply` does (Pruning clones, below), but
  claimed without waiting, and skips a busy clone as `mirror busy`. Both write
  the clone's last-used stamp, so a clone only surveyed is not pruned as
  unused. A survey's unscoped fetch of a managed clone prunes (`--prune`), since the
  clone is pr-update's own; a located checkout's fetch does not, since its
  `origin/*` is the person's. Neither removes a clone. In a clone, `survey`
  runs `git maintenance run --auto` in the foreground after its fetch, while
  it holds the lock, as every fetch of a clone does (Build note "The folder
  rule"). So `survey` writes nothing but its fetches (into a clone or a
  located checkout's `origin/*`), a clone's maintenance, the clone's stamp
  and the clone's lock file. (changed during the build: Build note 1)
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
  another run's prompt re-reads the file: when it holds the answer the person
  gave here, the run goes on with it; when it holds another, the run adopts
  neither and clones nothing, with a note. When
  the file cannot take the answer, because it is not valid YAML or its top
  level is not a map, nothing is asked: the run exits 14, the config-invalid
  code, naming it, and `mirror enable` and `mirror disable` do the same. A bad
  value in it is noted with the file's path and ignored. (changed during the build: Build note 1)
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
  - `enable [--mirror-dir <dir>]` writes `checkout: mirror` and, with `--mirror-dir`,
    `mirror_dir`, after checking it as clone step 1 does (changed during the build: Build note 1);
  - `disable` writes `checkout: local`;
  - `list` shows each clone's repository, size, last use and kept worktrees;
  - `prune`, below.
- **Clone.** GitHub only. A bare `owner/name` means a repository on the
  project root's host when that is GitHub (github.com or Enterprise, cloned as
  `host/owner/name`), else github.com. A Forgejo target with no checkout is
  skipped with a message, as today. Steps:
  1. check the mirror directory, whichever location it came from: it must
     not be inside a git working tree, and must be missing, empty or already
     marked by this tool, and belong to the person running it, as must its
     marker, a plain file. On POSIX no one else may write to it: writable by
     all (`mode & 0o002`) is refused, sticky bit or not, and writable by its
     group (`mode & 0o020`) unless the group is a user private group of the
     person's: the platform is not macOS (where every user's primary group
     is the shared `staff`), and the folder's group, the process's primary
     group (`process.getgid()`) and its uid (`process.getuid()`) are one
     number. That is what every folder a person makes looks like under umask
     `002` with user private groups (the default on Ubuntu, Debian and
     Fedora). The refusal names the
     `chmod go-w` that fixes it, or choosing a clone directory on a
     filesystem with Unix permissions (`--mirror-dir`,
     `PR_UPDATE_MIRROR_DIR`, `mirror enable --mirror-dir`), since exFAT, FAT
     and SMB shares show every folder as writable by all. The tool makes
     every folder it creates itself with mode `0o755` at most, whatever the
     umask: the clone directory and the `<host>`/`<owner>` folders, the
     folders above each run worktree (made before `git worktree add`, which
     would make them under the umask), each kept place, the machine file's
     folder and the attempt records' folders. So it never refuses one it
     made. The clone folder itself (made by `gh`) and each run worktree's
     folder (made by `git`) take the umask; for them only the owner is
     checked. Otherwise the run exits 2 and names the directory,
     having written nothing. Then write the tool's marker at its root if it
     is not there yet, create-if-absent, so two runs marking a new directory
     at once do not fail each other's check (changed during the build: Build note 1);
  2. take the clone's lock (`@osdlc/file-lock`), the file
     `<host>/<owner>/<name>.git.lock` beside the clone, so it exists before
     the clone does and survives the rename and the clone's removal;
  3. `gh repo clone <owner>/<name> <tmp> --no-upstream -- --bare`, with
     `GH_HOST` set to the target's host (port kept) and hooks off, where
     `<tmp>` is `<name>.git` inside a staging folder beside the final
     directory, `.tmp-<name>.git-<pid>-<random>`, which `mkdtemp` makes with
     mode `0700`, so no one else can reach the clone before step 7 (git needs
     an empty or missing target, so nothing is written at `<tmp>` first)
     (changed during the build: Build note 1);
  4. in the clone's own config, set `credential.https://<host>.helper` to an
     empty value and then to `!<gh> auth git-credential`, the two lines
     `gh auth setup-git` writes, so the fetch in step 6 and later fetches and
     pushes authenticate whatever the person's global git config holds.
     `<gh>` is `gh`'s absolute path, found on the absolute `PATH` entries
     only, shell-quoted: git runs the helper through the shell in the run
     worktree, which holds the PR's files. When no such `gh` is found, no
     helper is set, with a note (changed during the build: Build note 1);
  5. set `core.longpaths=true` (Windows paths under the cache are deep), and
     `maintenance.auto=false` and `gc.auto=0`, so no git starts a background
     maintenance that writes in the clone while it is hardened, moved or read
     without its lock (changed during the build: Build note 1);
  6. delete every `refs/heads/*`, set the fetch refspec, fetch with `--prune`,
     given the two settings of step 5 with `-c` too, then run
     `git maintenance run --auto` in the foreground, as after every fetch of
     a clone while its lock is held;
  7. write the clone's stamp and marker, take write for group and others off
     everything in `<tmp>` (`chmod -R go-w`), then rename `<tmp>` into place
     and remove the staging folder (changed during the build: Build note 1).

  A step that fails removes the staging folder, and the target is skipped
  with the error. A staging folder a killed run leaves is a `.tmp-*`
  leftover, which pruning removes once it is an hour old.

  A clone that exists is used only when this tool made it: a real directory,
  not a symbolic link, holding the tool's marker as a plain file, with the
  clone, the marker and the mirror directory owned by the person running it
  (by uid, on POSIX). The `<host>` and `<host>/<owner>` folders between, as
  far as they exist, and the mirror directory must be real folders (the
  mirror directory may be a link to one) that person owns and no one else
  can write to (by the rule of step 1); that is checked before a clone is
  made there too. Anything else at the clone path is never used or
  replaced, and the target is skipped saying why. A run looks at a clone
  again once it holds its lock: one a prune removed before the run took the
  lock is made again under that lock by `update --apply` with
  `checkout: mirror` consent, and otherwise its target is skipped with a
  note, never an error. (added during the build: Build note 1)
- **Trust.** The trust gate runs for each target before a command or agent
  starts in its worktree: `lockfile_install`, `resolvers`, a `verify` other
  than `none`, `repair.command` and `repair.agent`, from any config layer or
  flag (`worktreeCommands` in `src/trust.ts`). A located checkout is
  keyed by its path, as the project root is. A clone is keyed by
  `host/owner/name`, with the host's port left out, as trust-repo's
  repository keys take it (`pr-update trust host/owner/name` records one).
  `--trust` covers every target of the run. An untrusted
  target is skipped with reason `untrusted`, and the run goes on with the
  others. (changed during the build: Build note 1)
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
  | A kept worktree (`keep_failed`) | `--discard-kept`, `--retry-failed`, or the PR moving, unless someone has changed it or git cannot read it; only `--discard-kept` removes that (changed during the build: Build note 1) |
  | `origin/<branch>` for a deleted branch | `fetch --prune` on each unscoped fetch of the project root or a managed clone. A located checkout's fetch does not prune: its own `git fetch --prune` does (changed during the build: Build note 1) |
  | Unreachable objects | In a managed clone, `git maintenance run --auto` in the foreground after each fetch, under the clone's lock: a clone has git's automatic `gc` and background maintenance off. Elsewhere, git's automatic `gc` (changed during the build: Build note 1) |
  | A whole clone the person no longer targets | Automatic pruning by age, or `pr-update mirror prune` |

  Neither macOS nor common Linux setups clear `~/.cache` on their own, so
  without pruning the cache keeps one clone for every repository a run ever
  targeted.
- **Pruning clones.** A run never changes a clone without that clone's lock.
  An `update` run takes the locks of every clone it will use before its
  survey, in sorted path order. It holds each from its clone or fetch
  through its `git worktree add`, as one step, and again for `worktree
  remove` and for discarding a kept worktree of the clone; a clone with no PR
  to update is let go as soon as the run has picked its PRs. Taking a lock
  back, it waits only when it holds no other clone's lock, and otherwise
  claims without waiting. So a run waits only for a lock that sorts after
  every lock it holds, or while it holds none, and no two runs wait on each
  other in a cycle. A worktree whose lock it cannot get back is not removed:
  the run leaves it, with a note naming it. A run worktree is then a dead
  run's, which the next run in that clone or `pr-update mirror prune`
  removes; a kept worktree waits for another `--discard-kept`. With several targets, a clone whose turn
  comes later stays held while the targets before it are updated. It writes
  the last-used stamp when it first takes the lock. `update --apply` waits up
  to 60 seconds for each lock, then skips the target with reason `mirror
  busy`; a rehearsal does not wait. Between those steps the clone is in use through the
  run's worktree, which git records in the clone. Pruning takes
  the lock without waiting and holds it through the stamp check and the
  removal, and removes the lock file last. Under the lock, pruning first removes worktrees whose run is dead (by pid
  and start time, below), then skips a clone that still has any. A clone
  or temporary directory whose lock it cannot take is skipped. A clone
  directory without the tool's marker was not made by this tool and is never
  removed. A `.tmp-<name>.git-<pid>[-<random>]` directory is recognised by its name instead,
  inside a mirror directory that carries the tool's marker (clone step 1), so
  one left by a killed clone is removed once it is an hour old, as is a
  `.pr-update-probe-*` folder under `worktrees/` or `kept/`. A clone is renamed
  to such a name before it is deleted, so a removal that stops part-way leaves
  a leftover the next prune removes, not a broken clone at the clone path.
  Nothing is removed from a folder that `checkClone` would refuse (another
  user's, or one someone else can write to by the rule of clone step 1), and
  no walk follows a symbolic link. Under `worktrees/` and `kept/` the refusal
  names `chmod -R go-w <worktrees or kept directory>`; under the clone
  directory, clone step 1's fix. (changed during the build: Build note 1)

  Pruning also walks `worktrees/` in the cache, which holds the run
  worktrees of located checkouts as well as clones. A directory whose run is
  dead is removed. A run directory is named `<pid>.<time>`, the time in ms
  when the run began; the run is dead when no process has that pid
  (`pidAlive`) or the process with it started more than 10 minutes after
  that time (`processStartedAt`, both from `@osdlc/file-lock`), so a reused
  pid keeps no dead run's worktree. The margin is wide because the start time
  is read against the wall clock, which a clock step (NTP, a suspended
  laptop) can move by more than `sameProcess`'s 2 seconds, and a live run
  misread as dead would lose its worktree. A start time that cannot be read
  counts as alive. Pids
  belong to one machine, so the cache and state directories must not be
  shared between machines. First its `.git` file is read: it
  names `<common-dir>/worktrees/<id>`, whose `commondir` file gives the
  owning git directory; that record's `gitdir` must name the directory back.
  When the owner still exists, pruning runs `git worktree remove --force`
  there and deletes the dead run's scratch branch, holding the clone's lock
  when the owner is a managed clone. An owner whose `git worktree list` cannot
  be read, or does not show the directory, keeps it, and so does one that
  shows it locked (`git worktree lock`), unless the lock is git's own
  `initializing`, which a killed `git worktree add` leaves. A clone reads that
  lock from its own list, so it holds when the directory is missing too.
  (changed during the build: Build note 1) If the removal fails, only the
  directory and that one `worktrees/<id>/` record are deleted, never a bare
  `git worktree prune`, which would drop the person's own worktrees whose
  folders are missing. With the owner gone, or records that do not name the
  directory, only the directory is removed.
  `mirror list` shows these directories too, so a deleted or no-longer-targeted
  checkout leaves nothing behind in the cache. This walk ignores the age
  setting. (changed during the build: Build note 1)
  - *Automatic.* At the end of an `update --apply` that served a target from
    a clone or wrote under `worktrees/`, the run walks `worktrees/` and
    removes clones whose stamp is older than `mirror_max_age_days`. It notes
    each thing removed, each thing left for a folder someone else could
    write to or a clone it may not change, each failure, and the space
    freed; a failure does not change the run's exit. A run that never
    touches the cache, or that a signal stopped, never removes anything.
    (changed during the build: Build note 1)
  - *By hand.* `pr-update mirror prune` walks `worktrees/` and removes clones
    past the age (none with the age at `0`, unless `--older-than` or
    `--all-clones` is given).
    `--older-than <days>` overrides it, `--all-clones` takes every clone
    (`--all` is cli-tool's own, for `--help --all`), `--dry-run` only
    reports and takes no lock. It and `list` take `--mirror-dir`, so a
    directory left behind by a moved `mirror_dir` can be cleaned. It exits 1
    when something could not be removed or read. (changed during the build: Build note 1)
  - *Never removed:* a clone whose lock another process holds, one with a
    kept worktree, or one with a live run's worktree, even with
    `--all-clones`. `mirror prune --discard-kept` removes the kept worktrees
    of a clone it is removing first. Prune honours `git worktree lock`: a
    worktree git shows as locked, a dead run's or a kept one, is never
    removed, `--discard-kept` included, even when its folder is missing, and
    its clone stays with it.
    (changed during the build: Build note 1)
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
- pr-update keeps state under two roots for a while: everything above and the
  trust store (`<state>/osdlc/pr-update/trusted/`) under `osdlc/pr-update/`,
  and devlink's files under `pr-update/`. Each category lives in one place, and
  devlink's can move over later. Trust granted under the old
  `$XDG_STATE_HOME/pr-update/trusted/` was not carried over: a person runs
  `pr-update trust` again.
- A host that builds one attempt store or lease for several repositories has
  the same problem the facts name for `git-ref`. That is outside this record.

## Follow-ups

- A machine target for `pr-update config set`, in cli-tool's `config-command.ts`
  so every tool gets it. `pr-update mirror enable` and `disable` cover the
  `checkout` and `mirror_dir` keys until then.
- Move devlink's files under `osdlc/pr-update/`, or keep them where they are
  on purpose. The trust store has moved: trust-repo resolves it through
  tiered-dirs with its `app` option, as tool `osdlc`, app `pr-update`, so
  consent given to pr-update covers no other osdlc tool.
- Project config at `<repo>/.osdlc/pr-update.yaml` instead of `pr-update.yaml`
  at the root. No repository commits a `pr-update.yaml` today, so the move would
  break no one, but it is not part of this record.
- ref-lease should take a runner. It makes its own git client, so a target's
  `git-ref` record and lease cannot go through `withoutRepositoryVars` and
  instead name the target's repository in their environment (Build note
  "Repository variables (`GIT_DIR` and the rest)").
- A folder check on Windows. Ownership and mode are checked on POSIX only:
  NTFS ACLs are not read, so on Windows a clone directory, `worktrees/` or
  `kept/` that another user can write to is not refused.
- The next run's cleanup of a killed run's worktree (`releaseStaleScratch`),
  and in a clone of its rerere ledger, judges the run by its pid alone;
  pruning also reads its start time (Build notes).
- Prune and the kept-tree discard paths decide by themselves whether a
  worktree or branch is safe to delete, where `@osdlc/repo-cleaner` already
  does (`inspectWorktree`, its verdicts and risks). pr-update should keep
  only the clone-level decisions (the clone lock, the folder rule, removing
  the bare directory) and ask repo-cleaner about each worktree and branch,
  extending it where needed (bare clones, never unlocking a person's lock),
  planned with the pure-cache clone change. S13's prune and kept fixes
  (Build note "A person's work in a clone or a kept tree") are the safety net
  until then. See Known problem 27 in
  [the architecture guide](../../guide/architecture.md#found-in-s13).

## Build notes

- **Decision text edited during the build.** This is Build note 1. S6 to S8 changed the Decision
  to match the code as it was built. Each block they changed ends with
  "(changed during the build: Build note 1)", and each block they added with
  "(added during the build: Build note 1)". The accepted wording of each, and
  the note that explains the change:
  - `mirror_max_age_days`: "a bare `mirror prune` then removes no clone
    unless given `--older-than` or `--all`". See "`mirror prune`'s flags".
  - A located checkout's run worktree: "Inside the checkout the run writes
    only git's worktree records, its scratch branch and the fetched
    `origin/*` refs. A killed run leaves its worktree and scratch branch until
    pruning (below) or a later run on the same checkout removes them." See
    "What a run writes in a located checkout" and "What a killed run can
    leave in a located checkout".
  - Hooks off in a located checkout: not in the accepted text. See "Hooks off
    in run worktrees and other repositories".
  - Who clones: "They take the clone's lock for the fetch and write the
    clone's last-used stamp, so a clone only surveyed is not pruned as
    unused. They prune nothing." See "`survey`, rehearsals and the clone
    lock".
  - First use asks: the accepted text ended at "re-reads the file and uses the
    answer it finds", with nothing on a machine file that cannot take the
    answer (exit 14) or a bad value in it. The build never adopted another
    run's answer, so S13 rewrote that sentence to say what a lost race does.
    See "A machine file that cannot take an answer".
  - `pr-update mirror`: "`enable [--dir <dir>]` writes `checkout: mirror`
    and, with `--dir`, `mirror_dir`". See "`mirror enable --mirror-dir`".
  - Clone step 1: the directory "must not be inside a git working tree, and
    must be missing, empty or already marked by this tool", with no rule on
    owner or mode. See "The folder rule".
  - Clone step 3: "`gh repo clone <host/owner/name> <tmp> --no-upstream --
    --bare`", with no `GH_HOST` and nothing on hooks, where "`<tmp>` is
    `.tmp-<name>.git-<pid>` beside the final directory". See "Clone step 3",
    "Hooks off in run worktrees and other repositories" and "The folder
    rule".
  - Clone step 4: the helper was "`!gh auth git-credential`", `gh` looked up
    on `PATH` by the shell. See "The credential helper".
  - Clone step 5: "set `core.longpaths=true`" only. Clone step 6 ended at
    "fetch with `--prune`", and step 7 was "write the clone's stamp and
    marker, then rename into place". See "The folder rule".
  - A clone that exists: not in the accepted text, which did not say when a
    clone already at the clone path is used, or what happens when a prune
    removed it first. See "The folder rule" and "Clone locks".
  - Trust: "A clone is keyed by `host/owner/name`, which trust-repo does not
    support yet (with [osdlc/osdlc#1010](https://github.com/osdlc/osdlc/issues/1010))."
    trust-repo's repository keys are now built. See "Ports in names and
    paths".
  - The Cleanup table: the kept-worktree row ended at "or the PR moving", the
    `origin/<branch>` row read "`fetch --prune`, on each unscoped run that
    fetches", and the unreachable-objects row read "git's automatic `gc`"
    for every git directory, though a clone has it off (S13 found the table
    disagreeing with the build). See "Kept trees", "A located checkout's
    fetch does not prune" and "The folder rule".
  - Pruning clones: "An `update --apply` holds a clone's lock from its clone
    or fetch through its `git worktree add`, as one step, and again for
    `worktree remove`. … It waits up to 60 seconds for the lock, then skips
    the target with reason `mirror busy`." Dead worktrees were found by "the
    executor's existing check", and a `.tmp-*.git-<pid>` folder "left by a
    killed clone is removed", with no hour's wait, no probe folders, no
    rename before deleting, and no folder rule. See "Clone locks", "Telling a
    dead run", "Leftovers" and "The folder rule".
  - The walk of `worktrees/`: "A directory whose run is dead (the same pid
    check) is removed. … pruning runs `git worktree prune` there and deletes
    the dead run's scratch branch." See "Telling a dead run", "Removing a
    dead run's worktree" and "One check before a removal".
  - *Automatic*: "It prints each one removed and the space freed. A run that
    never touches the cache never removes anything." Nothing on failures,
    folders it left, or a signal. See "Pruning at the end of a run".
  - *By hand*: "`--all` takes every clone, `--dry-run` only reports", with
    nothing on locks or the exit code. See "`mirror prune`'s flags" and "One
    check before a removal".
  - *Never removed*: "a clone whose lock another process holds, or one with a
    kept worktree, even with `--all`. `mirror prune --discard-kept` removes
    the kept worktrees first." Nothing on a live run's worktree. See
    "`mirror prune`'s flags".
- **What a run writes in a located checkout.** Nothing in its working tree,
  index or HEAD. In its git directory:
  - a `worktrees/<id>/` record for each run worktree and kept tree, which
    live under pr-update's cache and state;
  - the run's scratch branch, `pr-update/scratch-<run>`, deleted at the end,
    made with `--no-track` so it writes no `branch.<name>.remote` or `.merge`
    keys in the checkout's config (the final review of the omnibus found
    them written while a run was on, and left by a killed one);
  - a kept tree's branch, `pr-update/failed-<owner>-<name>-<number>`, kept
    until the tree is discarded;
  - the objects the update builds (merges, rebases, repair commits, and the
    record and lease commits of `git-ref`), and the reflog entries of the
    refs above;
  - `refs/remotes/origin/*` from the run's fetch and push;
  - with `git-ref`, local `refs/pr-update/*` refs mirroring the remote's
    record and lease;
  - the line `/.pr-update-verify.log` in `info/exclude`, written once, when a
    kept tree gets a verify log;
  - with submodules, the `submodule.<name>.url` and `.active` keys in its
    config, set for the update and put back as they were after each PR, and
    the submodule clones git makes for the run worktree;
  - nothing in `rr-cache/`: pr-update's merges, rebases and commits there run
    with `rerere.enabled=false`, so rerere neither replays nor records, and no
    `rr-cache/` is made (Build note "Rerere in clones only").

  pr-update's own git calls there start no `gc --auto` (`targetGitEnv`
  sets `gc.auto=0` and `maintenance.auto=false`); the person's own git
  commands still do.
- **What a killed run can leave in a located checkout.** The run worktree's
  record and the scratch branch (the next run on that checkout removes them,
  since the run's pid is in the worktree's name); `submodule.*` keys that
  were not put back; and, when it stopped between making a kept tree and
  writing its record, a kept tree with no record. A later keep of that PR
  refuses to move into that folder, names it, and says how to remove it.
  Outside the checkout it can leave the run worktree's folder under the
  cache and, with `git-ref`, a lease ref on the remote until its TTL ends.
- **Cleaning up in a located checkout.** The run never runs a bare
  `git worktree prune` there, which would also drop the person's worktrees
  whose folders are missing. When `git worktree remove` of a run's own tree
  fails, it deletes only that tree's `worktrees/<id>/` record, after checking
  that its `gitdir` names a folder under pr-update's own directories.
- **Kept trees.** A record is used only when its `path` is the kept path its
  file name gives, compared by the real path of its folder. A tree whose
  owning git directory is gone, or that git cannot read, or that someone has
  changed, is never removed for being stale, `--retry-failed` included: the
  PR is skipped until `--discard-kept`. An owner that cannot be read is not
  gone (only `ENOENT` and `ENOTDIR` say so): `update --discard-kept` then
  refuses the record, where before the last review round it took the owner for
  gone and removed the tree. This holds for the project root's
  kept trees too, where `--retry-failed` used to discard a changed one.
  Different filesystems are found by renaming an empty probe folder,
  `.pr-update-probe-*`, into the kept directory and reading `EXDEV`; git's
  text, read in the C locale, is only a fallback. After the second review, a
  restack child (`--restack`) gets every kept-tree check another PR gets
  (changed, owner gone, kept elsewhere); before, a child whose kept tree a
  person had changed was updated and force-pushed. And a child's target's
  own attempt record is checked for an error again after `restackTarget`
  (`broken`), whose look-up of the child's new key can fail too; before, that
  failure read as no record and the child was pushed.
- **Kept records are not trusted.** A checkout's kept place,
  `.pr-update/failed/`, is in its working tree, so a cloned repository can
  commit a record there that names another repository's git directory and a
  branch to delete. Built after review, a record is refused when its branch
  is not `pr-update/failed-<owner>-<name>-<number>`, its path is not an
  absolute path to that PR's kept folder, or it names a `gitDir` in a
  checkout's own place, where pr-update never writes one. A tree is removed
  only through the git directory serving its place, and only when `git
  worktree list` there shows the folder on the record's branch; that check
  runs before any git runs in the folder. A refused record and its folder are
  left as they are, listed in the report's `keptRefused`, and the PR is
  updated as if nothing were kept, so a committed file cannot hold a PR back.
  After the first review of these fixes, that check was split. A folder `git
  worktree list` does not show at that path, or a kept path that is a
  symbolic link, is refused as before. A folder it shows at that path on
  another branch, or detached, is the person's: the PR is skipped as changed,
  nothing is removed, and `--discard-kept` leaves it (`keptLeft`). Every
  removal of a kept tree, a keep replacing the PR's old one included, checks
  the folders from the place's root down to it. The final review of the
  omnibus found that `mirror prune --discard-kept` force-removed a kept tree
  of a clone with no record, or with a refused one, whatever its branch. It
  now removes such a tree only while the clone lists it on a
  `pr-update/failed-*` branch, as a run stopped before writing the record
  leaves it; on any other branch, or detached, it is skipped as kept and
  reported, and the clone stays. The last review round found the same for a
  tree with a record. Pruning asked only the git directory the record named,
  and took one that was not there for leave to remove: after the clones folder
  was moved, a tree on a person's branch went with their uncommitted work. Now
  the clone being pruned must list the tree on its record's branch, whatever
  the record names, and the tree's own `.git` file must name that clone. The
  second rule is for a copy of a clone, which lists the tree on the branch it
  was on when copied. It means a kept tree of a moved clone stays, with its
  clone, until `git worktree repair`. A kept tree a person switched, and one
  whose record another repository does not bear out, is a skip (exit 0) in both
  modes: it is theirs, and `prune` would otherwise exit 1 for as long as they
  work in it. A record's owner whose worktrees cannot be listed is a failure
  (exit 1); `update` refuses such a record, as before. The extra round after
  the review cap found that the git directory a record names was asked
  whether it listed the tree, but not whether it was the clone being pruned.
  With a copy of a clone repaired to own the tree, `--discard-kept` removed
  the tree, its record and its branch through the original, whose lock the
  prune did not hold. A tree whose record names another git directory that
  still exists now stays, with its clone, in both modes.
- **Names starting with `.`.** A hard kill can leave the probe in
  `worktrees/<host>/<owner>/<name>/` or `kept/<host>/<owner>/<name>/`. Every
  walk pr-update makes of its own folders skips names starting with `.`:
  listing kept trees, and the walks of `mirror prune` and `mirror list`.
  Pruning removes a `.pr-update-probe-*` folder once it is an hour old.
- **Per-target errors.** An error from a target's own attempt store or lease
  (a remote that refuses `refs/pr-update/*`) skips that target's PRs with the
  error, and the run goes on. An error saving the record of a PR that already
  ran is reported on that PR (`recordError`), and any error no PR or skip
  shows is listed in the report's `recordErrors`. An error from the project
  root's store ends the run, as before. The stores of targets the trust gate
  refused are not pruned.
- **A host's `Ports`.** Scope says they are unchanged. `Ports.locate` is
  widened in a compatible way: `(repo, target?) => string | FoundCheckout |
  null`, asked with a lower-cased `owner/name` and the target's host. A
  one-argument `locate` that returns a path still compiles and is read
  through `--remote`, as before. `FoundCheckout` carries `others`, the
  repository's other checkouts, for the `unpushed_local` guard. A new
  optional port, `Ports.targetHome(target)`, says where a checkout keeps its
  run worktrees, kept trees, attempts and lease; without it, a host's
  checkout is served from its own `.pr-update/`, as the project root is. A
  host gets managed clones only by supplying `SurveyEnv.clones`.
- **The host of a bare `owner/name`.** "The project root's host" is the host
  of its `origin`, the remote its code host is picked from, after an SSH
  config alias is resolved with `ssh -G`. When `ssh -G` cannot resolve it, a
  note says so and the alias is used as written. A root that is not on
  GitHub gives github.com. `--remote` names only the project root's own
  repository and the remote it fetches.
- **Which targets can be cloned.** "GitHub only" means github.com, or the
  project root's host when its code host is GitHub (an Enterprise host with
  `code_host.override: github`). Any other host gets the note `there is no
  managed clone for <host>`, is never asked about, and runs no `gh repo
  clone`. Such a target is still listed through `gh` on its own host, so an
  Enterprise host named from a github.com root can be surveyed in a checkout
  but not cloned.
- **Ports in names and paths.** A host's port is kept for `GH_HOST`, the
  clone's credential key and the report. Every clone, run worktree, kept and
  attempt path, and the trust key, use `hostKey`: the host lower-cased with
  no port, so no path segment holds a `:`. `forgejo.local:3000/x/y` and
  `forgejo.local/x/y` were one target. (Changed during the build: S13,
  below; they are now `x/y` on two hosts, a usage error.) The CI review of the omnibus found that `--repo ghe.local:4000/o/n`
  was then served by a clone or a checkout of `ghe.local:3000`, so its PRs
  were listed from one server and pushed to the other. The owner asked for
  the smallest correct change (2026-11-27): a clone's marker records the host
  it was made for, port included (`ghHost`; a marker without one was made
  for its `repo`'s host, which has no port), and it serves only that host.
  A located checkout is used only when its `origin` is an `http(s)` URL on
  the target's port (the scheme's own counts as none), or an ssh URL for a
  target with no port; an ssh port is the ssh server's and cannot be told
  apart from another web port, so it fails closed. `LocateTarget` gained
  `port` for that. A bare `owner/name` takes the port of the project root's
  `http(s)` `origin` with its host, so a root on a port lists and serves its
  sibling repositories from that port. Paths and trust keys still drop the
  port, so two ports of one host still share them: the second port's target
  is refused, never served from the first's clone. Two `--repo`s of one
  `owner/name` on two ports of a host are a usage error, as on two hosts.
- **What `--repo` accepts.** Its `host/owner/name`, port dropped, must be a
  key trust-repo accepts (`parseTrustRepo`): a host name, owner and name of
  at most 200 characters, and no name ending in `.git` (the message gives the
  form without it). A part Windows cannot use as a folder name is refused
  too. Each of these exits 2.
- **A located checkout's fetch does not prune.** The Cleanup table's row for
  `origin/<branch>` said every unscoped fetch prunes. A checkout other than
  the project root is fetched with the refspec
  `+refs/heads/*:refs/remotes/origin/*`, no tags and no `FETCH_HEAD`. A
  refspec on the command line does not stop git from also applying the
  checkout's own fetch lines to what it fetches, so after review every such
  fetch, scoped or not and a clone's too, passes an empty `--refmap=`;
  without it a forced line into `refs/heads/` overwrote a local branch.
  Against that refspec, `--prune` would delete refs its own fetch lines keep,
  such as `origin/pr/*`, so a located checkout is fetched with `--no-prune`,
  which beats a `fetch.prune` or `remote.origin.prune` in its config. A stale
  `origin/<deleted>` there is harmless: survey reads only the listed PRs'
  head and base. The project root and a managed clone still prune.
- **Several checkouts of one repository.** The record did not say which one
  serves the run. The first by path does, and a note names the others. The
  `unpushed_local` guard reads every one, shallow ones included, each against
  its own `origin/<head>`.
- **A shallow-only checkout.** It counts as no checkout. A note says `<path>
  is shallow, so it is not used`, the first-run question names it, and a
  clone is still allowed.
- **A located checkout must pass the folder rule.** The CI review of the
  omnibus found that a located checkout got no ownership check, while a
  clone gets `checkClone`'s, and that a project root at `/tmp/proj` gave
  `/tmp` as the default root. Its `.git/config` runs as the person on fetch
  and push, before and outside the trust gate, and git's `safe.directory` is
  off under `safe.directory=*` and missing in 2.34.0 and 2.34.1. The owner
  decided (2026-11-27): a candidate whose work tree, git directory or
  `config` file belongs to another user or can be written by others
  (`folderProblem`, the clone directory's rule) is skipped with a note, is
  not among the `others` the guard reads, and its work tree is checked
  before pr-update runs git in it (the locator has read its `origin`
  already). The ecosystem package gives no default root outside home that
  others can write to (D-ZVIA, Build note "Default roots others can write
  to"). Since the rule refuses `g+w` unless the group is the person's
  private group, which is never so on macOS, a checkout made under umask 002
  on macOS is no longer used.
- **`roots: []`.** "With no roots" means no file or no `roots` key, as
  D-ZVIA's table says. `roots: []` scans nothing.
- **File attempts.** "One file per `host/owner/name`, head and base" is one
  store per repository, `attempts/<host>/<owner>/<name>/` in the state home,
  holding one file per head and base branch, as the project root's store
  does. A repository with no store of its own falls back to `Ports.attempts`.
- **Kept names.** In a repository's own kept folder a tree is named
  `<number>`. Its branch stays `pr-update/failed-<owner>-<name>-<number>`, so
  branches in a shared checkout stay apart. A record stores the owning git
  directory (`gitDir`) only for places outside a checkout, so the project
  root's records are unchanged.
- **What a target's trust gate covers.** The Trust bullet first named only
  commands a target's own files choose (`verify: detect`, `lockfile_install`).
  Built, it covers every setting that starts a command in a target's
  worktree, from any config layer or flag: `lockfile_install`, `resolvers`, a
  `verify` other than `none`, `repair.command` and `repair.agent`. The Trust
  bullet now names them. A target's own files
  decide what each of these runs. With none set, no trust is needed. The gate
  runs before any verify list is asked for and before kept trees are
  settled. A grant by name does not cover a located checkout.
- **A clone is made before the trust gate.** Cloning has its own consent and
  runs nothing from the repository. An untrusted target's clone stays, and
  nothing runs or is pushed in it.
- **When the clone is made.** `survey` never clones. `update --apply`
  resolves its targets once, clones those with no checkout after consent, and
  then surveys the resolved targets. For a target that can be cloned it holds
  back locate's not-found note, so the person reads one line.
- **`survey`, rehearsals and the clone lock.** As accepted, they took the
  lock for the fetch and pruned nothing. Built, a survey's unscoped fetch of a
  managed clone prunes, since nothing outside pr-update keeps refs there; a
  fetch scoped by `--pr` or `--branch` asks for named refs and does not. `survey`
  takes the lock without waiting and holds it while it fetches and reads the
  clone. When another run holds it, `survey` reads the clone as it is,
  without a fetch, with a note; if the clone is gone after that read, what
  was read is dropped and the target is reported not measured. A rehearsal
  holds locks as `update --apply` does but never waits, and skips a busy
  clone as `mirror busy`.
- **`checkout: local` and a clone that exists.** The clone is not used:
  `local` means no clone.
- **No terminal.** The error also names `pr-update mirror disable`, the way
  to keep the old skip.
- **A machine file that cannot take an answer.** When it is not valid YAML,
  or its top level is not a map, `update --apply` exits 14 before it asks,
  and `mirror enable` and `mirror disable` exit 14 too, leaving it as it is.
  A bad value in it is noted with the file's path and ignored. A relative
  `PR_UPDATE_MACHINE_CONFIG` is an error, exit 1. Every write is a
  compare-and-swap, made holding the lock file `<machine file>.lock`, by the
  rule `repositories.yaml`'s lock follows (taken over once its holder has
  exited or it is ten minutes old). The read the write is based on is made
  under the lock too. The final review of the omnibus found that without it
  two processes could both pass the check, and the second answer overwrote
  the first. The question itself is asked outside the lock, and the lock is
  never held while a person answers. `mirror enable` and `mirror disable`
  write over a `checkout` already there, since the person just asked for that
  value. The first-run answer never does: when the file under the lock
  already holds a `checkout`, nothing is written. If that is the answer the
  person gave (with the same clone directory), the run goes on with it. If
  not, the run adopts neither: it clones nothing, and each target with no
  checkout is skipped with a note naming what the file holds and
  `pr-update mirror enable [--mirror-dir <dir>]` or
  `pr-update mirror disable`, which change it. The CI review of the
  omnibus asked for this: adopting the other answer could clone for a person
  who had just said no, or into a directory they did not give.
  The first review of the final fixes found the same when the answer is
  written: a write keeps the file's other keys, so a `mirror_dir` an editor
  saved while the question was on screen stayed beside the `checkout: mirror`
  written, and the run cloned there. The file as written is now compared
  with the answer the same way, and a mismatch clones nothing, with the note.
- **`mirror enable --mirror-dir`.** Accepted as `--dir`. It is
  `--mirror-dir`, the flag's name on `survey` and `update`. It checks the
  directory as clone step 1 does, but neither makes nor marks it; the first
  clone does.
- **Clone step 3.** `gh repo clone` takes `<owner>/<name>`, so the host goes
  in `GH_HOST`, with its port. `GH_HOST` is set for every target other than
  the project root, github.com included, so a `GH_HOST` in the person's
  environment cannot move a target. `--no-upstream` is a real flag of gh 2.x.
- **Hooks off in run worktrees and other repositories.** The accepted text said nothing
  about hooks. Built, every git call pr-update makes for a target other than
  the project root runs with hooks off (`noHooksEnv` then, `targetGitEnv` now, which sets
  `core.hooksPath=/dev/null`): in a located checkout or a managed clone, in
  their run worktrees, the git that `gh repo clone` runs, and pruning's calls
  in the git directory that owns a dead run's worktree. A review during the
  build (S6, round 1) found hooks on there blocking: the run worktree checks
  out the PR's own files, so a relative `core.hooksPath` such as `.husky`
  would run hooks the PR's author wrote, whether or not the target is
  trusted. The final review of the omnibus turned them off in the project
  root's run worktrees and kept trees too (`gitOf` in `update.ts`), where
  `worktree add`, the forced checkout of the PR's head and the push ran the
  hooks a PR commits, with no trust gate, as on main before this work. The
  person's own pre-push hook no longer runs on pr-update's pushes either. The
  root's own fetch, survey, PR listing and branch mode's sync, in the
  person's checkout, keep its hooks. The same review found that an inherited
  `GIT_CONFIG_PARAMETERS`, which a git alias or hook started as
  `git -c core.hooksPath=.husky` passes on, beat `noHooksEnv`'s
  `GIT_CONFIG_COUNT` entry, since git reads it later. That function is now
  `targetGitEnv`, built on typed-git's `gitConfigEnv`, which also appends
  `'core.hooksPath'='/dev/null'` to `GIT_CONFIG_PARAMETERS`. The CI review
  of the omnibus asked for the same for a clone's `NO_MAINTENANCE` keys, which
  an inherited `-c gc.auto=…` could turn back on: `targetGitEnv` sets
  `maintenance.auto=false` and `gc.auto=0` the same way, for every git call
  in a target and for a target's `git-ref` record and lease (`refEnv` in
  `defaults.ts`). Since `targetGitOptions` also serves the project root's
  run worktrees and kept trees, pr-update's rebases, merges, commits and
  pushes there start no `gc --auto` either; the root's own fetch still can,
  and one rule for every call that carries hooks off keeps a per-call `env`
  from dropping a key. A clone's foreground maintenance still gets git's default
  `gc.auto` through its own `-c`, which git reads after both.
- **Repository variables (`GIT_DIR` and the rest).** A git hook exports
  `GIT_DIR`, and a program it starts inherits it. Every git that program runs
  then acts on the hook's repository, whatever directory it runs in; in a
  linked worktree, that moves the main checkout's branch. So these run with
  `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR`, `GIT_INDEX_FILE`,
  `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES` and an inherited
  `GIT_CEILING_DIRECTORIES` unset, through typed-git's
  `withoutRepositoryVars` (`REPOSITORY_VARS`), as the locator's own calls do:
  - every git call for a target other than the project root, including the
    git that `gh repo clone` runs;
  - every git call the update makes through the client it updates a checkout
    with, the project root's included, since that client runs in the run's
    worktrees and kept trees;
  - every child started in a worktree pr-update made: verify, resolvers and
    `lockfile_install` (the standalone `runVerb`), a repair command, a
    headless repair agent (agent-call's `unsetEnv`) and an attended one.

  The project root's fetch, survey, PR listing and branch mode's sync keep the
  environment as given: they run where the person ran pr-update. So the two
  must find the same repository. When one of these variables is set, `survey`
  and `update` first find the checkout twice, with the variables and without
  them, and compare the common directory and the top level. If only one finds
  a checkout, or they find different ones, the run stops with exit 2 before it
  lists or fetches: "pr-update runs in a git checkout; GIT_DIR and
  GIT_WORK_TREE are set and point elsewhere — unset them". A bare repository
  with `GIT_WORK_TREE` (a dotfiles setup) and a `GIT_DIR` naming another
  repository are refused. A git hook's own `GIT_DIR` passes, since a hook runs
  at the top of the work tree. So does a run from a subdirectory with no
  variables, or with both `GIT_DIR` and `GIT_WORK_TREE` naming the checkout.
  `GIT_DIR` alone from a subdirectory is refused: git then takes that
  subdirectory as the top of the work tree. When neither finds a checkout, as
  for a `--repo` run outside one or with git not installed, the run goes ahead
  and the later checks report what is missing. `GIT_CEILING_DIRECTORIES` is
  among these variables, though it chooses no repository: an inherited one can
  stop git finding the directory's own, so it is cleared with the rest
  (typed-git's `REPOSITORY_VARS` gives the reasons). A target's `git-ref`
  record and lease run through ref-lease, which makes its own git client and
  takes no runner (Follow-ups). Their environment names the target's
  repository instead: `GIT_DIR` and `GIT_COMMON_DIR` are its common directory,
  `GIT_OBJECT_DIRECTORY` its objects, and `GIT_ALTERNATE_OBJECT_DIRECTORIES`
  is empty, and a value set wins over an inherited one. ref-lease runs only
  `hash-object`, `mktree`, `commit-tree`, `update-ref`, `fetch`, `push` and
  `ls-remote`, which read neither a work tree nor an index, so an inherited
  `GIT_WORK_TREE` or `GIT_INDEX_FILE` changes nothing there. A library host's
  own `runVerb` and repair are its own to run.
- **How a target's PRs are listed.** Every target other than the project
  root is listed by name. Through `gh` that is `--repo owner/name` with
  `GH_HOST` set to the target's host, port kept, github.com included, so a
  `GH_HOST` in the person's environment cannot move it. The code host is chosen from the target's host, not from the remotes of
  the checkout that serves it: a target on the project root's host is listed
  through the project root's code host, and one on any other host through
  GitHub over `gh`. So a Forgejo target on another host is not supported.
  `--remote` names the project root's repository and the remote it fetches;
  the project root's `origin` picks the code host.
- **The folder rule.** Clone step 1 grew the ownership and mode rule now in
  it: a folder anyone can write to is refused, sticky bit or not, and a
  group-writable one unless the group is a user private group of the
  person's (never on macOS). pr-update makes its own folders with mode
  `0o755`, so it never refuses one it made. The same rule guards the
  `<host>` and `<owner>` folders, an existing clone, and every folder pruning
  removes from. For a clone, that is its own folder and its `config` too
  (added after review): a clone others could write to passed before. `gh`
  lays a clone down under the umask, so `makeClone` takes write for group and
  others off the whole tree before the rename. The `<host>` and `<owner>`
  folders are made one level at a time, each only once the folders above it
  pass the rule, before the clone's lock is taken; a folder that fails it, or
  that cannot be made or hold the lock, skips the target with why, where
  before a symbolic link had a folder made at its far end and an unwritable
  one ended the run with `EACCES`. A kept tree is removed, by `mirror
  prune --discard-kept` or by `update`, only when the folders from `kept/`
  down to it pass the rule; before review only run worktrees, leftovers and
  `.tmp-*` folders were checked. `Ports.targetHome` gained `keptRoot` for it.
  The root is compared by its real path, since git names a worktree by its
  real path: before the first review of these fixes, a state directory
  reached through a symbolic link skipped every folder between it and a kept
  tree. A path that is not under the root at all is refused.
  After the first review of these fixes, the clone is made in a staging
  folder `mkdtemp` makes (`0700`) beside its place,
  `.tmp-<name>.git-<pid>-<random>`, so no one else can reach it before it is
  hardened and renamed into place; pruning's leftover rule takes the new
  name. Its config gets `maintenance.auto=false` and `gc.auto=0` before its
  first fetch, which gets both with `-c` too: a detached `git maintenance`
  that fetch started had taken and dropped `objects/maintenance.lock` while
  the hardening walk ran, and could write in the clone after it. They stay
  in the clone's config, so no git command there starts maintenance in the
  background, where it would write without the clone's lock. pr-update's own
  calls also get them after any inherited `-c` (Build note "Hooks off in run
  worktrees and other repositories"). After the
  second review, so a clone used every day is still repacked, pr-update runs
  `git maintenance run --auto` in the foreground after each fetch of a
  clone, while it still holds the clone's lock, giving `gc.auto` git's
  default back for that call and turning off both `autoDetach` settings. The CLI's
  `main` takes group and others write out of the process's umask, so
  pr-update and every command it runs never create a file others can write
  to: fetches after the clone, run and kept worktrees, `FETCH_HEAD`. A host
  that calls `runUpdate` directly does not get this and sets its own umask.
  On Windows no ownership or mode check is made, since NTFS
  ACLs are not read: only the symbolic-link and marker checks apply.
- **The credential helper.** As accepted, a clone's config got
  `!gh auth git-credential`, which git runs through the shell, finding `gh`
  on `PATH`. The final review of the omnibus found that a relative `PATH`
  entry such as `.` then runs a `gh` the PR commits, since a push runs the
  helper in the run worktree. The helper now names `gh` by its absolute
  path, found on the absolute `PATH` entries only, as command-seam's
  `absolutePathOnly` finds a binary, and shell-quoted (`credentialHelper` in
  `mirror.ts`). Without such a `gh`, no helper is set and a note says so.
  Clones made before this change keep the old helper: none was released.
  The first review of the final fixes found the same hole wider: git looks
  up `ssh` for a push over ssh, the person's global `!gh auth git-credential`
  and `gpg` on `PATH` from the run worktree too, and a clone gets an ssh
  origin whenever gh's `git_protocol` is `ssh`. So `targetGitEnv` also gives
  every git call in a target, and in any run worktree or kept tree, a `PATH`
  holding only the absolute entries of the person's (command-seam's
  `absolutePathEntries`), `/usr/bin:/bin` on Linux and macOS when none is
  left. The helper keeps its absolute path for the person's own git commands
  in a kept tree, which get their own `PATH`.
- **Clone locks.** As accepted, `update --apply` held a clone's lock from its
  clone or fetch through `worktree add`, and again for `worktree remove`.
  Built, an `update` takes every lock it needs before its survey, in sorted
  path order; lets go of a clone with no PR to update once its PRs are
  picked; takes a lock back to remove a worktree or discard a kept one, and
  then waits only when it holds no other lock. A worktree whose lock it
  cannot get back is left, with a note. The final review of the omnibus
  found that keeping a failed PR's worktree (`--keep-failed`) and adding the
  run worktree back ran without the lock, so a `mirror prune --all-clones
  --discard-kept` between the two saw no run worktree and removed the kept
  tree and the clone. The run now takes the lock back for both, by the same
  rule (`ManagedClones.keeping`), and when it cannot, keeps nothing, says so
  in `keepError`, and goes on in the worktree as it is. Rehearsals hold locks
  too, without waiting. The wait polls with `Atomics.wait`, which blocks the process: fine
  for the CLI, not for a host with its own event loop.
- **Telling a dead run.** Pruning reads the run folder's `<pid>.<time>`: the
  run is dead when no process has the pid, or the process with it started
  more than 10 minutes after the time. `sameProcess`'s 2 seconds was too
  tight for a clock step. A start time that cannot be read counts as alive.
  Pids belong to one machine, so the cache and state directories must not be
  shared between machines. The next run in the same git directory, which also removes a killed run's
  worktree (`releaseStaleScratch`), still judges by pid alone: a reused pid
  keeps a dead run's worktree there until the pid is free or pruning removes
  it. It never removes a live run's.
- **Removing a dead run's worktree.** As accepted, pruning removed the
  directory and then ran `git worktree prune` in the owner. Built, it checks
  that the owner's record names the directory back, runs `git worktree
  remove --force` there (under the clone's lock in a clone) and deletes the
  scratch branch. When that fails it deletes only the folder and that one
  record. It never runs a bare `git worktree prune`, which would drop the
  person's own worktrees whose folders are missing.
- **One check before a removal.** Three review rounds each found another place
  where pruning took something it could not read for something that was not
  there, and removed it. So every removal (a dead run's worktree, a probe or
  `.tmp-*` leftover, a kept tree, a clone and the leftover at the name it is
  renamed to) now passes the same check, before a dry run and a real run part:
  - the folder rule, from the root down;
  - what is to be removed, and every folder on the way to it, can be read, and
    what a removal has to empty can be written to; the message names
    `chmod -R u+rwX <path>`. A link is never removed through;
  - `git worktree list` in the owner (the clone, or a dead run worktree's
    checkout) allows it. An owner that cannot be listed keeps its worktrees.
    The clone's list must be the clone's own, and its records
    (`worktrees/<id>/`) must be readable, since git leaves out one it cannot
    read, with no error: a clone with an unreadable record looked unused and
    was removed. After the review cap, an extra round found that git also
    leaves out a record whose `gitdir` file is missing or empty, so now every
    record must be in the list. A kept tree still on disk whose record names
    the clone keeps the clone too when the list does not show it (its record
    folder in the clone is gone, as `git worktree prune` leaves it when it ran
    while `kept/` was not mounted);
  - a worktree that list shows as locked stays, a dead run's or a kept one,
    and so does its clone. The lock git takes while `git worktree add` runs,
    `initializing`, does not count: a killed add leaves it. git writes that
    word in the language the add ran in, and pr-update's own adds do not fix
    the language, so a translated one counts as a person's lock and keeps the
    tree until `git worktree unlock`. The final check found that a dead run's
    worktree whose folder was missing (an unmounted drive, the case
    `git worktree lock` is for) skipped the lock: its owner is found through
    its folder, so the lock was never read, and the tree, its scratch branch
    and the clone were removed. The clone's own list is now read for the lock
    first. `ownedUnder`'s fallback after a failed `git worktree remove` leaves
    a locked worktree's folder and record, and so does it when the record's
    `gitdir` or `locked` file cannot be read (it took an unreadable lock for
    none), saying why; a prune then keeps the tree and its clone and reports
    it. `update`'s removal of a killed run's scratch worktree skips a locked
    one;
  - the clone's lock can be taken. A dry run takes none: it reads the lock as
    a claim reads it (file-lock's `readHeldLock`, the claim's own parser), so
    it says busy exactly where a claim would, and whether it could be
    written.

  Only `ENOENT` and `ENOTDIR` mean gone. Anything else stays and is reported
  under `failed`, on its own, and its siblings are still pruned. No removal is
  decided from what an earlier walk reported: a clone's listed run worktree is
  dropped with the clone only when its folder is really missing, and one that
  is there keeps the clone. Two inputs to a clone's age follow the rule too. A
  last-used stamp that cannot be read fails the clone (its marker's time, which
  stood in for it, is when the clone was made), and a machine file that cannot
  be read means no clone is removed for its age, since `mirror_max_age_days` in
  it may be `0`. So does one that is read but not valid (a YAML error, no
  mapping, or a value the schema refuses); before the extra round it gave the
  default, 30. A key the schema does not know, or a newer version read as it
  is, still gives the age as read.
- **Leftovers.** A `.tmp-<name>.git-<pid>[-<random>]` folder (a clone's
  staging folder, or a clone a prune could not finish removing) or a `.pr-update-probe-*`
  folder is removed once it is an hour old, so a clone in progress is never
  taken. A clone is renamed to a `.tmp-*` name before it is deleted, so a
  removal that stops part-way leaves a leftover, not a broken clone. Empty
  `<host>` and `<owner>` folders stay: removing them raced with another
  run's `mkdir`.
- **`mirror prune`'s flags.** `--all-clones`, not `--all`, which cli-tool
  keeps for `--help --all`. `--older-than` with `--all-clones` is a usage
  error. `--dry-run` takes no lock. `--discard-kept` reaches only the kept
  trees of a clone being removed, and removes a kept tree with no record
  there too. It exits 1 when something could not be removed or read; what it
  skipped (busy, kept, in use, not its own, in a folder that fails the folder
  rule) is not a failure. "Or read" adds to that line, and takes nothing from
  what was a skip but a kept tree whose record's owner could not be listed. A clone a live run has
  a worktree in is in use, and stays even with `--all-clones`. A clone with
  no last-used stamp is aged by the mtime of its marker, which was written
  when the clone was made.
- **Pruning at the end of a run.** It runs after the run has let go of its
  locks, when an `update --apply` served a target from a clone or made a run
  worktree for a located checkout under the cache, and not after a signal.
  After review it reads that from the report's `madeTargetWorktree`, not from
  the results, so a run whose every lease was refused still prunes. Its notes name
  what it removed, the space freed, failures, and what it left for a folder
  someone else could write to or a clone it may not change; a busy, kept or
  in-use clone is not noted, since that is the cache working as meant. It is
  not in the JSON output.
- **Not tested.** Built by construction, with no test that shows it: the
  results of `osdlcDirs` and `prUpdatePaths` on win32 (tiered-dirs tests its
  Xdg convention's Windows paths, `%APPDATA%` and `%LOCALAPPDATA%`, but not
  these two over it); that devlink's `PR_UPDATE_*` variables move none of the
  files above; and that `PR_UPDATE_CONFIG` moves only the project file. The
  machine file reads only `PR_UPDATE_MACHINE_CONFIG` and the `OSDLC_*`
  variables. Also without a test: that only the CLI reads the machine file
  and asks (a library host gets clones only through `SurveyEnv.clones`), and
  that removing a clone leaves its attempt records (pruning never walks
  `attempts/`). In a located checkout, unreachable objects are left to
  the `gc --auto` of the person's own git commands, with no code here; a managed clone gets the
  foreground `git maintenance run --auto` after each fetch instead (Build note
  "The folder rule"). Windows git's text for a cross-device rename is not checked
  either; the probe decides first.
- **Rerere in clones only.** S12 turned git's rerere on for every target of
  `update --apply`, which read and wrote the `rr-cache/` of the person's own
  checkout for the project root and a located checkout. The CI review of the
  omnibus found that a resolution the person had recorded there, on any
  branch, was then replayed into a PR and pushed with no resolver, repair or
  report. The owner decided (2026-11-27) that rerere is used only in a managed
  clone, where pr-update owns `rr-cache/`; everywhere else every merge, rebase,
  abort and commit pr-update runs passes `rerere.enabled=false`, so the
  person's own resolutions and config are never used and no `rr-cache/` is
  made. In a clone:
  - `rerere.autoUpdate=false`, so a replayed path stays conflicted in the
    index; the replayed paths are the conflicted ones `git rerere remaining`
    leaves out, with `MERGE_RR` present and no conflict markers in the file. A
    replayed path a resolver claims is rebuilt by it; any other is reported in
    the outcome's `replayed`, the text report and the merge commit's message.
  - A PR that is not pushed drops its variant's postimage, preimage and,
    when empty, its `<id>` folder, so a `merge --abort` leaves no
    preimage-only folder.
  - A killed run: before anything can record a resolution (a rebuild, a
    repair, `--continue`, the commit), the run writes the variants it has
    tracked and not accepted to `pr-update-rerere/<pid>.<time>.json` in the
    clone's git directory, and takes them off when the PR is pushed or
    dropped. The next `update` served from the clone, under its lock and
    before it integrates anything, removes the variants each dead run listed
    (by pid alone, as `releaseStaleScratch` judges a run) and the list. A
    concurrent run already past that step can still replay a dead run's
    unaccepted resolution until then.
  What is replayed in a clone is a resolution pr-update recorded there and
  pushed with an earlier PR; `verify` is its only check.
- **A person's work in a clone or a kept tree.** The CI review of the
  omnibus found four ways a person's work could go. The owner decided
  (2026-11-27):
  - A prune removed a clone without asking whether it held work found
    nowhere else. A clone's fetches make only remote-tracking branches, so a
    clone now stays, in a dry run too, while it holds a local branch with
    commits no remote-tracking branch has (`git rev-list <branch> --not
    --remotes`), a stash or a notes ref. The branches the prune deletes
    itself do not count: the kept trees' (all of them go under
    `--discard-kept`), dead runs' scratch branches, and any other
    `pr-update/scratch-*` branch. A `pr-update/failed-*` branch no worktree
    is on does count. In a clone, a stash also counts as a change to a kept
    tree (`keptIsTouched`), so `update` does not discard it as stale; in a
    person's checkout the stash is theirs and does not count. `update` never
    removes a clone, so the clone check is prune's alone.
  - A kept tree whose folder was missing was removed with its clone under
    `--discard-kept`. It now stays, locked or not, like a locked one, until
    the person mounts it or runs `git worktree prune` in the clone.
  - A kept tree a person locked lost its folder: `git worktree remove
    --force` refuses a locked tree, and the folder was deleted after it
    anyway. `keptTreeCheck` now reads the lock (`locked`), and every caller
    treats such a tree as the person's, as it does a moved one; the removal
    itself deletes the folder after a failed remove only once the list shows
    the tree is not locked.
  - A keep made its branch with `git checkout -B`, which repointed a
    `pr-update/failed-*` branch that was already there. It now uses `-b`. A
    branch that is already there is deleted first only while it points at the
    old kept tree's `builtOid` and no worktree has it checked out; otherwise
    the keep fails with a note. A keep that is undone deletes the branch only
    if it made it. `--discard-kept` still deletes a kept tree's branch with
    the tree, commits and all, as it always said.
- **Trust granted before this build.** trust-repo first copied the old
  markers into the new store, and every way of telling whether the copy had
  run brought back a revoked grant in some case. The owner dropped the copy
  (2026-11-23): the store under `osdlc/pr-update/` starts empty, so earlier
  grants stop counting and the person runs `pr-update trust` again, once per
  machine. It fails closed. The README says so where an upgrading user looks
  first.
- **Size.** Against main, at the end of the omnibus (S13, the CI review's
  fixes, included), pr-update's `src/` has 7,031 lines added and 485 removed,
  against the estimate of 700, and its `tests/` 10,085 added and 93 removed
  (`git diff --shortstat origin/main...HEAD`, merge base `93271347`, whose
  pr-update is that of `88112cb4`). At the end of S12 it was 6,407 and 455,
  and 9,585 and 91.
- **Nested groups.** `--repo` takes exactly `owner/name` or
  `host/owner/name`, so a GitLab repository in a nested group can be found
  by the locator but not named as a target. The clone is GitHub only.

## What would reopen it

A host where `gh repo clone` cannot authenticate, or where the clone-local
helper does not authenticate later fetches and pushes; evidence that
`git worktree add` from a bare clone misbehaves with this tool's submodule
handling; or an owner need for a literal `--mirror` push of all refs.
