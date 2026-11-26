# @osdlc/host-cleaner

Machine cleanup as plugins. A plugin proposes **candidates** (things that could
be deleted) and **objects** to candidates. The core decides what runs, checks
again, and has each owner delete its own candidates, with one flat plan and one
receipt. The `git` plugin is [`@osdlc/repo-cleaner`](../repo-cleaner/README.md):
its sweep supplies worktrees and branches, and its `removeCandidate` deletes them,
under repo-cleaner's safety model.

This release is the library, the `git`, `cargo`, `node` and `orca` plugins, and the `host-cleaner` command.

## Phases

Plugins run in a fixed order: `git`, `cargo`, `node`, `orca`, then
any other in the order given. The order decides which plugin keeps a duplicate id, and the order `prepare` and `deleted` run in.

| Phase | Who | What |
| --- | --- | --- |
| scope | each plugin | adds roots to look in; the only way a plugin adds a repository |
| discover | each plugin | proposes candidates; a duplicate id keeps the first plugin's, with a warning naming both |
| object | each plugin | objects to any candidate; sees no other plugin's objections |
| decide | core | `refuse` blocks, `protest` needs `--allow <code>`, `note` does not gate |
| re-check | core | discovers and objects again; a candidate now refused is `blocked`, a protest not granted `not-allowed`, a vanished one `gone`, one whose evidence moved `changed` |
| prepare | every plugin | before the delete; a throw stops only that candidate, a `FatalRun` stops the run. `ctx.run` holds the candidates the run deletes. A returned sentence is kept in the step's `prepared`, even if the candidate then fails |
| delete | the owner | returns the receipt sentence |
| deleted | every other plugin | after the delete; best effort, failures are in the receipt |

A candidate's `requires` lists the candidates that must go first. If one is
refused, dropped or fails, the candidate is too; requirements are deleted
before their dependents (a branch after the worktree that holds it).

```ts
import { clean, plan, survey, type Ctx, type Plugin } from '@osdlc/host-cleaner'

// A plugin that owns one candidate: a cache directory idle for a week.
const cache: Plugin = {
  name: 'cache',
  detect: () => true,
  discover: () => [
    {
      id: 'artifact:build-cache',
      kind: 'artifact',
      path: 'build-cache',
      owner: 'cache',
      why: 'idle for a week',
      evidence: { bytes: 4096 },
    },
  ],
  delete: (c) => `removed ${c.path}`,
}

const ctx: Ctx = { cwd: process.cwd(), targets: [], allow: [] }
const found = survey([cache], ctx) // scope, discover, object
const receipt = clean(plan(found), [cache], ctx) // re-check, prepare, delete, deleted
```

What a plan runs uses repo-cleaner's words, with their meaning:

- **The default:** every candidate nothing refuses or protests and no owner
  holds for review (`held: true`).
- **`select`:** exactly these candidate ids instead of the default.
- **`pick`:** these as well; a candidate held for review runs only when picked
  or selected.
- **`spare`:** leave these alone: an id, a path, a name (every candidate of
  that name, as a branch and the worktree that has it checked out), or a glob
  over ids, paths and names. A spared candidate that would have run is
  dropped as `spared`.

Each candidate that runs is still judged by the rules above.

### Machine-scope plugins

A plugin that cleans outside any checkout (a cache directory, a toolchain
folder) declares `roots(ctx)`: the directories it cleans, fixed or taken from
its own settings. Every candidate it owns must sit strictly below one of them,
proven on real paths with `@osdlc/path-guard`, so a `..` or a symlink that
leaves is not inside, and the root itself is never a candidate. A candidate
that is itself a link is judged by its target, so a link pointing out of the
roots is refused. A plugin's `delete` must act on the candidate's path alone. The core
refuses one that is not (`outside-roots`, by `host-cleaner`) and checks again
right before `delete`, failing that step if the path moved out since the
re-check. `containedIn(roots, path)` is exported for plugin code that wants the
same check. `ignore` applies to these candidates as to any other.

## The `git` plugin

`gitPlugin(options)` proposes repo-cleaner's worktrees and branches. Its
blockers are `refuse` objections and its risks `protest`s, so
`--allow abandon-unmerged` and the others work as in repo-cleaner. A branch
freed by a worktree requires it. With `archive` (`clean --archive` on the
command line), unlanded work is pushed to the remote first: `prepare` pushes one
archive of everything the run deletes in a repository (`ctx.run`) before its
first candidate there, or before another plugin's candidate inside one of the
run's worktrees. Without `ctx.run`, it archives each candidate it was not given
before. The step that pushed it records the archive in `prepared`. A failed push
throws `FatalRun`, and a candidate with unlanded work in a repository with no
remote is refused (`no-remote`). Work that changed since the archive fails that
candidate, and stays: so does a worktree whose files another plugin's delete
inside it changed. Grant the named risks; the `discard-archived` cover is not
yet offered here.

## The `cargo` and `node` plugins

Build caches fill agent machines, so two plugins list them. Both propose
`artifact:<absolute path>` candidates with their size. Settings:
`plugins.<name>.idleHours` (default 24).

- `cargo`: a `target/` with a `CACHEDIR.TAG` whose newest file under
  `target/*/.fingerprint/` is at least `idleHours` old. Where incremental
  builds are off (`CARGO_INCREMENTAL`, else `CARGO_BUILD_INCREMENTAL`, else `cargo config
  get build.incremental`, which only nightly cargo answers), `target/*/incremental` is its own candidate,
  held for review while it is not idle.
- `node`: `node_modules` of a linked worktree where nothing outside
  `node_modules`, `.git` and `target` changed for `idleHours`. A primary
  checkout is never proposed. A `.pnpm` tree frees less than it measures.

A `cargo` or `rustc` process in the checkout (any busy process for `node`), or
a process table that cannot be read, is a `refuse`. A path that leads outside
its checkout (checked with `@osdlc/path-guard`) is a `refuse` and is never
measured. `delete` reads the checkout's candidates again over a fresh process
table, removes the directory and checks it is gone; a directory that is already
gone (its worktree went first) is not a failure.

## The `orca` plugin

Orca keeps its own record of some worktrees and holds terminals and agents open
in them. Removing one with plain git leaves the record and the terminals behind,
so this plugin works beside `git`, which still removes the directory.

Detected when the `orca` CLI is on `PATH` (or at
`/Applications/Orca.app/Contents/Resources/bin/orca`). Orca missing is silent.
When it is installed but not running, or `orca status` fails or prints no JSON,
there is no fallback to git: every `git` worktree whose path is under
`/orca/workspaces/` is refused with `orca-unreachable`, and the rest are left to
`git`. It never fails the run. Every call goes through `@osdlc/command-seam` with `--json`.

| Phase | What it does |
| --- | --- |
| scope | Adds each repository `orca repo list` names (`plugins.orca.repos: false` turns this off). |
| discover | A record in `orca worktree ps` whose directory is gone is `orca-record:<path>`, held for a pick. |
| object | On a `git` worktree that Orca manages: a `note` with its Orca id; a `refuse` `orca-agent-active` when an agent is at work (any state not `idle` or `done`); a `refuse` `orca-terminal-unverifiable`; a `protest` `close-terminals` when terminals are open. If Orca is running but cannot be read, every `git` worktree is refused with `orca-unreachable`; while it is not running or its status cannot be read, only those under `/orca/workspaces/` are. |
| prepare | Sees again that no agent is at work, then `orca terminal close --worktree id:<id> --all`. |
| deleted | After `git` removed the directory, `orca worktree rm --worktree id:<id> --force` so Orca forgets the record. It is never asked while the directory exists, since it would delete it. The branch is kept. |

```sh
host-cleaner clean --pick worktree:/path/to/wt --allow close-terminals
```

## Command line

The command works in repo-cleaner's phases, with its flags. Nothing runs until
a phase is named; the bare command explains them and exits 2.

```sh
host-cleaner status [target...]   # every candidate and what objects to it; deletes nothing
host-cleaner plan -o plan.json
host-cleaner clean [--plan plan.json] [--pick <id>] [--spare <id|name|glob>] [--allow <code>] [--archive [--archive-exclude <glob>]] [-i] [--yes | --dry-run]
host-cleaner config [--format json]   # every plugin's effective settings
```

| Flag | Meaning, as in repo-cleaner |
| --- | --- |
| `--pick <id>` | Also run this candidate. One its plugin holds for review runs only when picked. |
| `--spare <id\|name\|glob>` | Leave these alone: an id, a path, a branch name (its worktree too) or a glob. |
| `-i` | Choose from a checklist, the default candidates ticked; each ticked protest is asked for by code. Needs a terminal. |
| `--allow <code>` | Accept a protest by its code. |
| `--archive` | `clean`: before deleting unlanded work, push it to `archive/<repo>-local-<date>` (`<date>` is the UTC date) on the repository's remote, as repo-cleaner does. `abandon-unmerged` and `discard-changes` still need `--allow` by name. |
| `--archive-exclude <glob>` | With `--archive`, leave files matching this glob out of a worktree's snapshot. Repeatable. |
| `--worktrees`, `--branches` | Only the git plugin's worktrees, or only its local branches. Remote branches are repo-cleaner's. |
| `--all-rows` | `status`: also show candidates a plugin refuses. |

`--plugin <name>` runs only those plugins (`--adapter` is an alias) and
`--skip-plugin <name>` never runs these. Targets default to the config file's
`targets`, then the directory you are in. `clean` re-checks, shows the steps,
asks (`--yes` skips the question; with no terminal and no `--yes` it exits 2),
deletes, and writes one receipt to `--receipt` or the state directory's
`receipts/`, plus a line in `logs/host-cleaner.log`.

With `--archive`, a run makes one archive per repository, before it deletes any
of its worktrees or branches. A second run on the same day goes to
`archive/<repo>-local-<date>-2`, and so on. The archive does not hold submodule
commits and files, stashes, ignored files, or the files a snapshot leaves out
(secret-shaped, `--archive-exclude`, over 10 MiB). `--archive` with a run that
does not use the git plugin, and `--archive-exclude` with `--branches` alone,
are refused with exit 2; an exclude that matches no worktree in the run does
nothing. The preview says how many candidates have unlanded work pushed, and
`--format json --dry-run` lists them under `archive`. Any failed archive step
(the push, or reading the remote's default branch) stops the whole run, across
every repository: that candidate and every one after it are left, with no plugin
having acted on them, and the run exits 11. A worktree that changed since its
archive is left too, and the run goes on. A repository with no remote cannot be
archived, so the git plugin refuses (`no-remote`) its candidates that hold
unlanded work, and the preview shows them skipped.

```sh
host-cleaner clean --archive --pick branch:/path/to/repo:topic --allow abandon-unmerged
```

The config is `config.json` in the config directory (`HOST_CLEANER_ROOT` moves
all three directories):

```json
{ "targets": ["~/dev"], "plugins": { "cargo": { "idleHours": 48 }, "node": { "enabled": false } } }
```

`plugins.<name>` holds that plugin's settings; a name that no plugin has is an
error. Each plugin's settings are a strict schema, checked when the config
loads: a misspelt key or a wrong type is refused (exit 2), naming the plugin and
the key.

| Setting | Plugins | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | every plugin | `true` | `false` leaves the plugin out of every run. `--plugin <name>` runs it anyway. |
| `idleHours` | `cargo`, `node` | the top-level `idleHours`, else `24` | Hours an artifact must have sat unused before it is a candidate; `0` or more, and `0` takes every artifact. |

Two settings sit at the top of the config and apply to every plugin:

```json
{ "targets": ["~/dev"], "ignore": ["~/dev/dashboard"], "idleHours": 0 }
```

- `ignore` lists paths nothing may be deleted in or below (`~` is home; a path
  is matched by its real path too). `--ignore <dir>` adds to it and can repeat.
  A candidate there is left out, with a warning saying how many; `status` prints
  the active list, a plan records it, and `clean --plan` honours the plan's list
  and the current one, dropping a planned candidate as `ignored`.
- `idleHours` is the default for every plugin that has the setting and does not
  set its own. `0` is allowed and makes every idle-checked artifact a candidate.

`host-cleaner config` prints every plugin's effective settings: the value, and
whether the file set it or it is the default. `--format json` prints the values.

### Exit codes

0 done, declined or nothing to delete; 1 failed against the state found; 2
cannot run as typed; 10 nothing to sweep; 11 `clean` stopped at a failed step.

## Install

```sh
npm install @osdlc/host-cleaner
```

Node 22.22.2 or later, ESM only.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
