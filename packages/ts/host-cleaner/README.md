# @osdlc/host-cleaner

Machine cleanup as plugins. A plugin proposes **candidates** (things that could
be deleted) and **objects** to candidates. The core decides what runs, checks
again, and has each owner delete its own candidates, with one flat plan and one
receipt. The `git` plugin is [`@osdlc/repo-cleaner`](../repo-cleaner/README.md):
its sweep supplies worktrees and branches, and its `removeCandidate` deletes them,
under repo-cleaner's safety model.

This release is the library, the `git`, `cargo`, `node` and `orca` plugins, and the `host-cleaner` command.

## Phases

Plugins run in the order they are given. The command line runs the shipped
ones, `BUILT_IN_PLUGINS`, in that list's order: `git`, `cargo`, `node`, `orca`.
The order decides which plugin keeps a duplicate, and the order `prepare` and `deleted` run in.

Each shipped plugin is one `definePlugin({ name, api, settings, create })`
value: `api` is `PLUGIN_API`, `settings` is the zod schema of its entry in the
config's `plugins` (the core adds `enabled` and makes it strict), and `create`
builds the plugin from those settings, validated with defaults filled in, and
the plugin kit (see [The plugin kit](#the-plugin-kit)).

| Phase | Who | What |
| --- | --- | --- |
| scope | each plugin | adds roots to look in; the only way a plugin adds a repository |
| discover | each plugin | proposes candidates; two with the same id, or path candidates with the same real path, are one: the first plugin's stands, with a warning naming both |
| object | each plugin | objects to any candidate; sees no other plugin's objections |
| decide | core | `refuse` blocks, `protest` needs `--allow <code>`, `note` does not gate |
| re-check | core | discovers and objects again; a candidate now refused is `blocked`, a protest not granted `not-allowed`, a vanished one `gone`, one whose evidence moved `changed` |
| prepare | every plugin | before the delete; a throw stops only that candidate, a `FatalRun` stops the run |
| delete | the owner | returns the receipt sentence |
| deleted | every other plugin | after the delete; best effort, failures are in the receipt |

Any hook may answer straight away or return a promise. The core awaits each
one in turn, one plugin at a time, so `survey`, `recheck` and `clean` return
promises. Each call has a time limit: 30 seconds (`HOOK_LIMIT_MS`), or 10
minutes for `delete` (`DELETE_LIMIT_MS`); a plugin may set its own per hook in
`limits` (a positive number of milliseconds; any other value is warned of and
the default used). Past the limit the core aborts `ctx.signal`, the call's own signal,
and counts the call as a throw: a timed-out `detect` leaves the plugin out, a
timed-out `object` refuses every candidate, and a timed-out `delete` fails
that step.

A limit stops a hook that waits: on a promise, a timer or a program. It cannot
stop synchronous work, such as a folder walk or a program run to its end: the
core times such a hook out when it answers past its limit, and drops the
answer. What it did by then stands, so a `delete` timed out so may have
removed its folder. A hook that works for long should await between two pieces
of work and stop once `ctx.signal` has aborted, as `cargo` and `node` do
between checkouts.

`detect` answers `true`, `false`, or `{ active, note }`: `active` is whether
the plugin runs, and `note` is a sentence for a person, such as why a plugin
that still runs is degraded (Orca installed but not running: its worktrees
must still be refused, so it stays active). The core keeps each plugin's note,
whether it runs or not, in the survey's `notes` (plugin name to note, plain
JSON). `status`, `plan` and `clean` print each as a warning line naming the
plugin, so a degraded plugin shows on the commands that act too, and
`status --format json` and `clean --format json` carry them under `notes`. An
answer of any other shape leaves the plugin out with a warning.

Every hook's `ctx` carries `targetsGiven`: true when a person named the
targets, in the config or on the command line, and false when the command line
fell back to the directory it runs in (and when a `RunCtx` leaves it unset). A
plan keeps it, so `clean --plan` tells the plugins the same; a plan without it
is refused: sweep again.

A `RunCtx` may name `home`, the home folder no root may be or hold (see the
roots rules); unset, it is the process's. The CLI sets it from `HOME`, the
same home it expands `~` with.

A candidate's `requires` lists the candidates that must go first. If one is
refused, dropped or fails, the candidate is too; requirements are deleted
before their dependents (a branch after the worktree that holds it). The core
adds one itself: a path candidate requires every path candidate inside it, by
real path, since deleting it would delete them. So `cargo`'s `target/` goes
before the git worktree that holds it, and a `target/` that does not run
(refused, spared, held, or carrying a protest not allowed) keeps the worktree
too. The worktree is then `blocked`, and its reason names each candidate
inside it that does not run and what would let it run: `requires
artifact:…/target, which needs --allow unmeasured`, `which needs --pick <id>`
(held or not selected), `which is refused (<plugin>: <reason>)` or `which is
spared (--spare <entry>)`. The clean preview, the `clean -i` checklist and the
receipt show it.

```ts
import { join } from 'node:path'

import { clean, plan, survey, type Plugin, type RunCtx } from '@osdlc/host-cleaner'

// A plugin that owns one candidate: a cache directory idle for a week, inside the target.
const dir = join(process.cwd(), 'build-cache')
const cache: Plugin = {
  name: 'cache',
  detect: () => true,
  discover: () => [
    {
      id: `artifact:${dir}`,
      kind: 'artifact',
      path: dir,
      owner: 'cache',
      why: 'idle for a week',
      evidence: { bytes: 4096 },
    },
  ],
  delete: (c) => `removed ${c.path}`,
}

const ctx: RunCtx = { cwd: process.cwd(), targets: [process.cwd()], targetsGiven: true, allow: [] }
const found = await survey([cache], ctx) // scope, discover, object
const receipt = await clean(plan(found), [cache], ctx) // re-check, prepare, delete, deleted
```

What a plan runs uses repo-cleaner's words, with their meaning:

- **The default:** every candidate nothing refuses or protests and no owner
  holds for review (`held: true`).
- **`select`:** exactly these candidate ids instead of the default.
- **`pick`:** these as well; a candidate held for review runs only when picked
  or selected.
- **`spare`:** leave these alone: an id, a path (a ref candidate's `ref`,
  the folder it is `at`, or `<at>:<ref>`, as in `~/dev/app:release-1.2`), a name (every candidate of that name, as a branch
  and the worktree that has it checked out), or a glob over ids, paths and
  names. A spared candidate that would have run is
  dropped as `spared`.

Each candidate that runs is still judged by the rules above.

### What deleting costs

A candidate may say what deleting it costs, in `costDescription`:
`re-download` (it can be fetched again), `rebuild` (it can be built again) or
`lost` (it is gone for good). The core applies one rule to every plugin's
candidates: a `lost` one is held for review and carries a `discard-user-data`
protest (by `host-cleaner`), so it runs only when it is picked and
`--allow discard-user-data` is given. A candidate with any other value is
dropped with a warning. `status` shows the cost in a column of its own, `-`
when a candidate does not say.

### Paths, refs and containment

A candidate is a **path** (`path`), a folder its owner deletes, or a **ref**
(`ref`, with an optional `at`, the directory it belongs to), a thing with no
folder of its own that its owner deletes by name, such as a branch or a record
another program keeps. Ids stay `<kind>:<path>`, or `<kind>:<ref>`.

Every path candidate, whatever its plugin, must sit strictly below one of its
owner's roots or a target, or be or sit inside a linked worktree of a
repository a target is in, or of a repository whose main checkout is or sits
inside a target (git's `--git-common-dir`, on real paths). So with
`targets: ["~/dev"]`, a worktree of `~/dev/app` kept in `~/worktrees/app-fix`
is inside, while a worktree of a repository outside `~/dev`, and any other
folder outside it, is not. The worktree must be one its repository lists, so a
copied `.git` file or a worktree moved from where it was added does not count,
nor does one whose folder has since become a link: nothing at or below it, or
where the link points, is inside.
A repository's main checkout counts only as far as a target covers it. A
plugin that cleans outside any checkout (a
cache directory, a toolchain folder) declares `roots(ctx)`: the directories it
cleans, fixed or taken from its own settings. Without `roots`, a plugin is held
to the targets alone. Containment is proven on real paths with
`@osdlc/path-guard`, so a `..` or a symlink that leaves is not inside, and a
plain root or a target itself is never a candidate. A store that is removed
whole, such as `~/.npm`, is declared `{ path, self: true }` among the roots:
that folder may then be a candidate itself, as well as anything inside it.

The core refuses a root, plain or self, that is the filesystem root (`/`), is
or holds the home folder, is a personal folder (`PERSONAL_FOLDERS`:
`~/Documents`, `~/Desktop`, `~/Downloads`, `~/Pictures`, `~/Music`,
`~/Movies`, `~/Library`, `~/.ssh`, `~/.config`), is or holds a target or a
linked worktree, or is a checkout (holds `.git`), and a self root that is a
symlink. It leaves such a root out with a warning (`<plugin>: roots: left out
the root <path>: <why>`), so its candidates are refused `outside-roots`. The
same check runs again right before `delete` and in `kit.remove`, so a self
root that has become a checkout or a symlink since the survey is not removed.

Real paths are read with `realpathSync.native`, which spells a path as the
filesystem does: where it ignores case, as macOS's does, `~/documents` is
`~/Documents`, and compares so. A candidate that is itself a link
is judged by its target, so a link pointing out is refused. A plugin's `delete`
must act on the candidate's path alone. The core refuses one that is not
(`outside-roots`, by `host-cleaner`) and checks again right before `delete`,
failing that step if the path moved out since the re-check.
`containedIn(roots, path)` is exported for plugin code that wants the same
check.

A ref gets no folder checks, and the core never removes a folder for one.
`ignore` applies to a path, and to a ref's `at`.

### The plugin kit

`create` gets `kit`, the safety helpers the shipped plugins use, bound to the
plugin's name, so a plugin measures, removes and runs things the same way
(`pluginKit(name, options)` builds one, for tests). Each run, once the
plugin's `roots` hook has answered, the core binds the kit it was created with
to those roots, the run's targets and their linked worktrees (as above), so `kit.remove`
needs no more than the path. The plugin `create` returns through
`definePlugin` is tied to its kit, and `cargoPlugin` or `nodePlugin` called
without it to the kit it builds; a kit no run has bound removes nothing.

| Helper | What it does |
| --- | --- |
| `kit.idle(path, { skip })` | How long the folder sat unchanged: the newest modification time under it and the hours since, fractions included, links not followed, within a time budget (`MEASURE_BUDGET_MS`, 10 seconds). Several folders, as a list, are one answer within one budget. Out of time, it is `{ unmeasured: true }`. |
| `kit.size(path)` | Bytes on disk, by repo-cleaner's `sizeOf` (`du`) within the same budget; `null` when unread. |
| `kit.running(name \| { name } \| { in }, ctx)` | The processes of a program, by name, or the busy processes working in a folder (an idle shell is not busy); `unknown` when the process table cannot be read. A name matches a word of a process's command line (`ps -axo pid=,ppid=,args=`): a word whose last path segment is the name or has it as one of its dot-separated parts (`commandHasName`). So `pnpm` finds `node /opt/homebrew/bin/pnpm dev` and corepack's `.../pnpm.cjs`, and `GradleDaemon` or `gradle` finds `java ... org.gradle.launcher.daemon.bootstrap.GradleDaemon`. Case counts. host-cleaner's own process and the unbroken line of ancestors above it whose command lines name host-cleaner are left out, so the `npm exec` or `pnpm dlx` that started it does not count, but an editor, terminal or `tmux` it runs inside does. The table is read fresh once per hook call; one that could not be read stays `unknown` for the rest of it. |
| `kit.onPath(program)` | Whether a program is on PATH. |
| `kit.candidate({ kind, path \| ref, ... })` | A candidate with its id (`<kind>:<path>` or `<kind>:<ref>`) and the plugin as owner. |
| `kit.run(argv, { signal, check })` | Runs a program through `@osdlc/command-seam`, with a time limit (`RUN_LIMIT_MS`, 30 seconds) and stopped when `ctx.signal` aborts; `ok` when it exited 0, a `CommandFailed` throw with `check`. |
| `kit.remove(path, ctx?)` | Removes a folder only if it is still inside the plugin's roots, is one of its self roots, or is inside a target or a linked worktree of one (as in [containment](#paths-refs-and-containment)) by its real path, as the core bound them this run; checks it is gone and returns the receipt sentence. Where something in it may not be removed, its read-only folders and files are made writable and the removal tried once more. It removes nothing in a survey's hooks before that survey binds it, or in a ref candidate's `delete`. With `ctx`, it removes nothing once `ctx.signal` has aborted. |

`idleHoursSetting` is the `idleHours` setting: a plugin that declares it
inherits the config's top-level `idleHours` when its own entry sets none, and
`idleHoursOr(idle)` is the threshold it names, the default when unset. A plugin
that walks checkouts itself skips those `coveredBy(path, ctx.ignore ?? [])`
finds ignored; `present(path)` says whether something, a link included, is
there.

A candidate whose idle time ran out of the budget sets `unmeasured: true`. It
is not held; the core gives it an `unmeasured` protest (by `host-cleaner`), so
it runs only with `--allow unmeasured`. The flag stays out of `evidence`, so a
walk that finishes at the re-check does not read as `changed`.

### Testing a plugin

`@osdlc/host-cleaner/testing` holds what a plugin's own tests need, and no test
runner:

| Export | What it is |
| --- | --- |
| `fakeContext(over)` | A hook's context: no targets, `targetsGiven: false`, nothing allowed, a signal never aborted. |
| `fakeRunner({ program: answers })` | Fake programs for the kit: spread it into `pluginKit`'s options. A program in the table is on PATH and answers as command-seam's `fakeRunner` does; `calls` records each run. |
| `tempHome()` | A new empty folder, by its real path, with `cleanup()`. |
| `contractSuite(plugin, ctx, { deleteLimitMs })` | Surveys the plugin twice and returns one line per broken rule. |

The suite checks that `limits` name hooks; that the survey warns of nothing
(every limit is a positive number, no hook throws or runs past its limit, `detect`'s answer and each root has a
shape the core takes, ids are unique, each candidate is the plugin's and has
one of a path and a ref; a `detect` note is not a problem); that every path
candidate is inside the plugin's roots or the targets, or is one of its self
roots; that ids and evidence are the same in both
surveys; that candidates and objections hold only what JSON keeps, so a plan
reads back; and that `delete` refuses a folder outside the roots and the
targets. For that last check it moves one of the plugin's own path candidates
into a folder of its own, outside the roots and the targets (it checks that),
leaves a symlink in its place and calls `delete`. `delete` must throw within
`deleteLimitMs` (`SUITE_DELETE_LIMIT_MS`, 30 seconds) and leave the moved
folder as it was; the suite then puts it back. A plugin with no path candidate
on disk gets a made-up one outside instead. Give it a fixture where the plugin
is detected and proposes something: a plugin that does not is a problem too.
Every shipped plugin passes it:

```ts
expect(await contractSuite(plugin, { cwd: root, targets: [root] })).toEqual([])
```

## The `git` plugin

`gitPlugin(options)` proposes repo-cleaner's worktrees, as paths, and branches,
as refs (`ref` the branch's name, `at` its repository). Its
blockers are `refuse` objections and its risks `protest`s, so
`--allow abandon-unmerged` and the others work as in repo-cleaner. A branch
freed by a worktree requires it. With `archive`, unlanded work is pushed to the
remote first; a failed push throws `FatalRun`. Grant the named risks; the
`discard-archived` cover is not yet offered here. Its `delete` refuses a
worktree whose folder has become a symlink, since `git worktree remove` would
follow it and empty the folder it leads to. Its `discover` sweeps every
repository in one synchronous call, so it has a 10 minute limit.

## The `cargo` and `node` plugins

Build caches fill agent machines, so two plugins list them. Both are built
on the plugin kit alone and propose `artifact:<absolute path>` candidates with
their size on disk. Settings: `plugins.<name>.idleHours` (default 24).

- `cargo`: a `target/` with a `CACHEDIR.TAG` whose newest file under
  `target/*/.fingerprint/` is at least `idleHours` old. Where incremental
  builds are off (`CARGO_INCREMENTAL`, else `CARGO_BUILD_INCREMENTAL`, else `cargo config
  get build.incremental`, which only nightly cargo answers), `target/*/incremental` is its own candidate,
  held for review while it is not idle.
- `node`: `node_modules` of a linked worktree where nothing outside
  `node_modules`, `.git` and `target` changed for `idleHours`. A primary
  checkout is never proposed. A `.pnpm` tree frees less than it measures.

A folder whose idle time cannot be measured in the kit's budget is proposed
`unmeasured` and not sized. Its evidence leaves out the newest modification
time and the size, so the re-check judges idleness again instead: one no
longer idle is `gone`. Since `discover` walks every checkout, both plugins
give it a 10 minute limit instead of the default 30 seconds, and let that limit
fire between two checkouts.

A `cargo` or `rustc` process in the checkout (any busy process for `node`), or
a process table that cannot be read, is a `refuse`. A path that leads outside
its checkout (checked with `@osdlc/path-guard`) is a `refuse` and is never
measured. `delete` reads the checkout's candidates again over a fresh process
table, then removes the directory with `kit.remove`; a directory that is already
gone (its worktree went first) is not a failure.

## The `orca` plugin

Orca keeps its own record of some worktrees and holds terminals and agents open
in them. Removing one with plain git leaves the record and the terminals behind,
so this plugin works beside `git`, which still removes the directory.

Detected when the `orca` CLI is on `PATH` (or at
`/Applications/Orca.app/Contents/Resources/bin/orca`). Orca missing is silent.
When it is installed but not running, or `orca status` fails, prints no JSON or
takes over 20 seconds, there is no fallback to git: every `git` worktree whose path is under
`/orca/workspaces/` is refused with `orca-unreachable`, and the rest are left to
`git`; `detect` gives the reason as its note. It never fails the run. Every
call goes through `@osdlc/command-seam` with `--json`.

| Phase | What it does |
| --- | --- |
| scope | Adds each repository `orca repo list` names (`plugins.orca.repos: false` turns this off). |
| discover | A record in `orca worktree ps` whose directory is gone is `orca-record:<path>`, a ref to Orca's record (`at` is the gone directory), held for a pick. |
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
host-cleaner status [target...]   # every candidate, what deleting it costs, and what objects to it; deletes nothing
host-cleaner plan -o plan.json
host-cleaner clean [--plan plan.json] [--pick <id>] [--spare <id|name|glob>] [--allow <code>] [-i] [--yes | --dry-run]
host-cleaner config [--format json]   # every plugin's effective settings
```

| Flag | Meaning, as in repo-cleaner |
| --- | --- |
| `--pick <id>` | Also run this candidate. One its plugin holds for review runs only when picked. |
| `--spare <id\|name\|glob>` | Leave these alone: an id, a path, a branch name (its worktree too) or a glob. |
| `-i` | Choose from a checklist, the default candidates ticked; each ticked protest is asked for by code. Needs a terminal. |
| `--allow <code>` | Accept a protest by its code. |
| `--worktrees`, `--branches` | Only the git plugin's worktrees, or only its local branches. Remote branches are repo-cleaner's. |
| `--all-rows` | `status`: also show candidates a plugin refuses. |

The text output writes the home folder in an id as `~`
(`worktree:~/dev/wt`, `branch:~/dev/repo:main`), and `--pick` and `--spare`
take that form, also when `HOME` goes through a symlink. host-cleaner refuses to run as root (exit 1). `status`,
`plan` and `clean` print each plugin's `detect` note as a warning line naming
the plugin, with the survey's warnings.

`--plugin <name>` runs only those plugins and
`--skip-plugin <name>` never runs these. Targets default to the config file's
`targets`, then the directory you are in. `clean` re-checks, shows the steps,
asks (`--yes` skips the question; with no terminal and no `--yes` it exits 2),
deletes, and writes one receipt to `--receipt` or the state directory's
`receipts/`, plus a line in `logs/host-cleaner.log`.

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
