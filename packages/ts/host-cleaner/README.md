# @osdlc/host-cleaner

Machine cleanup as plugins. A plugin proposes **candidates** (things that could
be deleted) and **objects** to candidates. The core decides what runs, checks
again, and has each owner delete its own candidates, with one flat plan and one
receipt. The `git` plugin is [`@osdlc/repo-cleaner`](../repo-cleaner/README.md):
its sweep supplies worktrees and branches, and its `removeCandidate` deletes them,
under repo-cleaner's safety model.

This release is the library, the `git`, `cargo`, `node` and `claude-code` plugins, and the `host-cleaner` command.

## Phases

Plugins run in a fixed order: `git`, `cargo`, `node`, `claude-code`, `orca`, then
any other in the order given. The order decides which plugin keeps a duplicate id, and the order `prepare` and `deleted` run in.

| Phase | Who | What |
| --- | --- | --- |
| scope | each plugin | adds roots to look in; the only way a plugin adds a repository |
| discover | each plugin | proposes candidates; a duplicate id keeps the first plugin's, with a warning naming both |
| object | each plugin | objects to any candidate; sees no other plugin's objections |
| decide | core | `refuse` blocks, `protest` needs `--allow <code>`, `note` does not gate |
| re-check | core | discovers and objects again; a candidate now refused is `blocked`, a protest not granted `not-allowed`, a vanished one `gone`, one whose evidence moved `changed` |
| prepare | every plugin | before the delete; a throw stops only that candidate, a `FatalRun` stops the run |
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
  holds for review (`unattended: false`).
- **`select`:** exactly these candidate ids instead of the default.
- **`pick`:** these as well; a candidate held for review runs only when picked
  or selected.
- **`spare`:** leave these alone: an id, a path, a name (every candidate of
  that name, as a branch and the worktree that has it checked out), or a glob
  over ids, paths and names. A spared candidate that would have run is
  dropped as `spared`.

Each candidate that runs is still judged by the rules above.

## The `git` plugin

`gitPlugin(options)` proposes repo-cleaner's worktrees and branches. Its
blockers are `refuse` objections and its risks `protest`s, so
`--allow abandon-unmerged` and the others work as in repo-cleaner. A branch
freed by a worktree requires it. With `archive`, unlanded work is pushed to the
remote first; a failed push throws `FatalRun`. Grant the named risks; the
`discard-archived` cover is not yet offered here.

## The `cargo` and `node` plugins

Build caches fill agent machines, so two plugins list them. Both propose
`artifact:<absolute path>` candidates with their size, and both set
`unattended`. Settings: `plugins.<name>.idleHours` (default 24).

- `cargo`: a `target/` with a `CACHEDIR.TAG` whose newest file under
  `target/*/.fingerprint/` is at least `idleHours` old. Where incremental
  builds are off (`CARGO_INCREMENTAL`, else `CARGO_BUILD_INCREMENTAL`, else `cargo config
  get build.incremental`, which only nightly cargo answers), `target/*/incremental` is its own candidate.
- `node`: `node_modules` of a linked worktree where nothing outside
  `node_modules`, `.git` and `target` changed for `idleHours`. A primary
  checkout is never proposed. A `.pnpm` tree frees less than it measures.

A `cargo` or `rustc` process in the checkout (any busy process for `node`), or
a process table that cannot be read, is a `refuse`. A path that leads outside
its checkout (checked with `@osdlc/path-guard`) is a `refuse` and is never
measured. `delete` reads the checkout's candidates again over a fresh process
table, removes the directory and checks it is gone; a directory that is already
gone (its worktree went first) is not a failure.

## The `claude-code` plugin

Lists running Claude Code sessions (`session:<pid>`) and closes one when asked.
Detected through `@osdlc/detect-harness` (or, with no report, the config
folder; `CLAUDE_CONFIG_DIR` moves it). A session is a process whose executable
is `claude` or `claude.exe`, or `node` running a `claude` script, found with
`ps` and its working directory with `lsof`. Each candidate carries a
`close-session` protest and is never `unattended`, so a session closes only
when picked and allowed by name. A session that host-cleaner itself runs
inside (an ancestor of its process) is refused with `own-session`.

```sh
host-cleaner clean --pick session:1234 --allow close-session   # the usual clean, and this session
host-cleaner clean -i                                           # tick only the session
```

Its evidence holds the start time, the command, the working directory, the
resume id, the transcript's last write, other sessions resuming the same id,
and whether the directory is gone or temporary. `delete` checks the pid still
has the planned start time and command, sends SIGTERM and waits for the exit.
It never sends SIGKILL; a session that ignores SIGTERM fails its step.

## Command line

The command works in repo-cleaner's phases, with its flags. Nothing runs until
a phase is named; the bare command explains them and exits 2.

```sh
host-cleaner status [target...]   # every candidate and what objects to it; deletes nothing
host-cleaner plan -o plan.json
host-cleaner clean [--plan plan.json] [--pick <id>] [--spare <id|name|glob>] [--allow <code>] [-i] [--yes | --dry-run]
```

| Flag | Meaning, as in repo-cleaner |
| --- | --- |
| `--pick <id>` | Also run this candidate. One its plugin holds for review runs only when picked. |
| `--spare <id\|name\|glob>` | Leave these alone: an id, a path, a branch name (its worktree too) or a glob. |
| `-i` | Choose from a checklist, the default candidates ticked; each ticked protest is asked for by code. Needs a terminal. |
| `--allow <code>` | Accept a protest by its code. |
| `--worktrees`, `--branches` | Only the git plugin's worktrees, or only its local branches. Remote branches are repo-cleaner's. |
| `--all-rows` | `status`: also show candidates a plugin refuses. |

`--plugin <name>` runs only those plugins (`--adapter` is an alias) and
`--skip-plugin <name>` never runs these. Targets default to the config file's
`targets`, then the directory you are in. `clean` re-checks, shows the steps,
asks (`--yes` skips the question; with no terminal and no `--yes` it exits 2),
deletes, and writes one receipt to `--receipt` or the state directory's
`receipts/`, plus a line in `logs/host-cleaner.log`.

The config is `config.json` in the config directory (`HOST_CLEANER_ROOT` moves
all three directories):

```json
{ "targets": ["~/dev"], "plugins": { "git": {} } }
```

`plugins.<name>` holds that plugin's settings; a name that no plugin has is an
error.

### `clean --auto` and `schedule`

`host-cleaner clean --auto` cleans with no person present: it takes the candidates
whose owner marked them `unattended: true` and that nothing refuses or
protests, and grants no `--allow`. That is a clean worktree (`git`) and an
artifact idle past its threshold with nothing building in its checkout
(`cargo`, `node`). Branches, sessions and anything with a protest are left for
a person. `--spare` leaves more out; `--pick`, `--allow`, `-i`, `--yes` and
`--dry-run` are refused. A lock in the state directory stops a second run; the
run writes a report to `reports/`, a receipt to `receipts/` and a log line.

`host-cleaner schedule install [--every <hours>]` (default 6) writes a launchd
user agent that runs `host-cleaner clean --auto`, with the `HOST_CLEANER_*`
overrides it was installed with (it needs `targets` in the config file, since
launchd starts the job in `/`); `schedule status` and `schedule uninstall`
show and remove it. macOS only.

Exit codes: 0 done, declined or nothing to delete; 1 failed against the state
found; 2 cannot run as typed; 10 nothing to sweep; 11 `clean` stopped at a
failed step. A run that finds the lock held exits 0.

## Install

```sh
npm install @osdlc/host-cleaner
```

Node 22.22.2 or later, ESM only.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
