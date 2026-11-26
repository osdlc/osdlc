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
answer. A `delete` that answers late is the exception: it has deleted by
then, so its answer counts, the other plugins' `deleted` run and what
requires it goes ahead. A hook that works for long should await between two pieces
of work and stop once `ctx.signal` has aborted, as `cargo` and `node` do
between checkouts.

`detect` answers `true`, `false`, or `{ active, note }`: `active` is whether
the plugin runs, and `note` is a sentence for a person, such as why a plugin
that still runs is degraded (Orca installed but not running: its worktrees
must still be refused, so it stays active). The core keeps each plugin's note,
whether it runs or not, in the survey's `notes` (plugin name to note, plain
JSON). `status`, `plan` and `clean` print each as a warning line naming the
plugin, so a degraded plugin shows on the commands that act too, and
`status --format json` and `clean --format json` carry them under `notes`. The
answer may also give `vars`, the variables the plugin's folders use and the
source of each, as a descriptor's plugin does; `inspect` returns them and
`host-cleaner plugins` shows them. A sweep does not read them, and `inspect`
drops `vars` that are not that shape with a warning and keeps the plugin. An
answer of any other shape leaves the plugin out with a warning.

Every hook's `ctx` carries `targetsGiven`: true when a person named the
targets, in the config or on the command line, and false when the command line
fell back to the directory it runs in (and when a `RunCtx` leaves it unset). A
plan keeps it, so `clean --plan` tells the plugins the same; a plan without it
is refused: sweep again. In `detect`, `ctx.running` holds the names of the
plugins found active so far, in run order.

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
artifact:…/target, which needs --allow unmeasured`, `which needs --pick <id>
when the plan is made` (held or not selected; a saved plan takes no `--pick`
at `clean --plan`, so it goes to `plan`, or to `clean` without `--plan`),
`which is refused (<plugin>: <reason>)` or `which is spared (--spare <entry>)`. The clean preview, the `clean -i` checklist and the
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

`inspect` asks the plugins where they stand without proposing anything: it
calls `detect`, `scope` and `roots` as `survey` does, and nothing else, as
`host-cleaner plugins` does. Each `PluginState` says whether its plugin is
detected, why not (what `detect` threw, or why its answer was left out), the
note and the variables (`vars`) `detect` gave, and its roots, less those the
core refuses. When a detected plugin's `roots` threw, timed out or had every
root refused, `rootsFailed` says so, since its candidates outside the targets
are then refused. A failed `scope` or `roots` is a warning. A plugin its `skip`
option picks is listed as `skipped` and none of its hooks run, as
`host-cleaner plugins` lists a plugin the config disables.

```ts
import { inspect } from '@osdlc/host-cleaner'

const seen = await inspect([cache], ctx) // detect, scope, roots; seen.ctx has the scoped targets
for (const p of seen.plugins) console.log(p.name, p.detected ? p.roots : (p.reason ?? 'not detected'))
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
where the link points, is inside. A worktree whose folder is gone, or left
without its `.git`, has no checkout to find its repository from, so `git`
declares it as a root `{ path, self: true }` of its own, and its record can
still be pruned.
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
| `kit.idle(path, { skip })` | How long the folder sat unchanged: the newest modification time under it and the hours since, fractions included, links not followed, within a time budget (`MEASURE_BUDGET_MS`, 10 seconds). Several folders, as a list, are one answer within one budget. A path that is a file is aged by itself. Out of time, it is `{ unmeasured: true }`. |
| `kit.overBudget()` | A check that turns true once the same budget has passed since the call, by the kit's clock: for a plugin that measures several things as one. |
| `kit.size(path)` | Bytes on disk, by repo-cleaner's `sizeOf` (`du`) within the same budget; `null` when unread. |
| `kit.running(name \| { name } \| { in }, ctx)` | The processes of a program, by name, or the busy processes working in a folder (an idle shell is not busy); `unknown` when the process table cannot be read. A name matches a word of a process's command line (`ps -axo pid=,ppid=,args=`): a word whose last path segment is the name or has it as one of its dot-separated parts (`commandHasName`). So `pnpm` finds `node /opt/homebrew/bin/pnpm dev` and corepack's `.../pnpm.cjs`, and `GradleDaemon` or `gradle` finds `java ... org.gradle.launcher.daemon.bootstrap.GradleDaemon`. Case counts. host-cleaner's own process and the unbroken line of ancestors above it whose command lines name host-cleaner are left out, so the `npm exec` or `pnpm dlx` that started it does not count, but an editor, terminal or `tmux` it runs inside does. The table is read fresh once per hook call; one that could not be read stays `unknown` for the rest of it. |
| `kit.onPath(program)` | Whether a program is on PATH. |
| `kit.candidate({ kind, path \| ref, ... })` | A candidate with its id (`<kind>:<path>` or `<kind>:<ref>`) and the plugin as owner. |
| `kit.run(argv, { signal, check })` | Runs a program through `@osdlc/command-seam`, with a time limit (`RUN_LIMIT_MS`, 30 seconds) and stopped when `ctx.signal` aborts; `ok` when it exited 0, a `CommandFailed` throw with `check`. |
| `kit.remove(path, ctx?)` | Removes a folder only if it is still inside the plugin's roots, is one of its self roots, or is inside a target or a linked worktree of one (as in [containment](#paths-refs-and-containment)) by its real path, as the core bound them this run; checks it is gone and returns the receipt sentence. Where something in it may not be removed, its read-only folders and files are made writable and the removal tried once more. It removes nothing in a survey's hooks before that survey binds it, in a ref candidate's `delete`, or once `clean` is over. With `ctx`, it removes nothing once `ctx.signal` has aborted, and given `delete`'s `ctx` it holds to that call's bounds even while another run binds the same plugin. |

`idleHoursSetting` is the `idleHours` setting: a plugin that declares it
inherits the config's top-level `idleHours` when its own entry sets none, and
`idleHoursOr(idle)` is the threshold it names, the default when unset. The core
tells `create` where each setting came from (`init.sources`: `config`, `shared`
or `default`), and a definition's `idleHoursOf(idleHours, source)` lists the
parts with a threshold of their own, for `config` to print. A plugin
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
| `fakeProcesses({ folder: processes })` | A process table for the kit: spread it into `pluginKit`'s options. `/` lists every process, by command line; any other folder, those working in it. |
| `ageTree(dir, hours)` | Sets the modification time of a folder and all in it to `hours` ago; links are not followed. |
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

On a real machine, `host-cleaner plugins` says whether a plugin is detected and
where it may delete, and `host-cleaner status --plugin <name>` runs that plugin
alone and shows its candidates and objections. Neither deletes anything.

### Descriptors

A descriptor is a plugin written as a YAML (or JSON) file, `descriptor: 1`:
named folders in `paths`, one value for `all` or one per OS, and the
`candidates` under them. Where the command line finds descriptor files is under
[Command line](#command-line).

```yaml
# yaml-language-server: $schema=https://unpkg.com/@osdlc/host-cleaner/schemas/descriptor-1.json
descriptor: 1
detect:
  any: [{ onPath: uv }, { exists: cache }]
paths:
  cache: { all: ~/.cache/uv }
candidates:
  - path: cache
    costDescription: re-download
    command: [uv, cache, prune, --cache-dir, '{path}']
    removes: unused
inUse:
  processes: [uv]
```

```ts
import { DescriptorError, readDescriptor } from '@osdlc/host-cleaner'

try {
  const descriptor = readDescriptor('uv.yaml')
} catch (err) {
  // One line per problem, such as `line 8: candidates.0.path: no folder named "models" in paths`.
  if (err instanceof DescriptorError) console.error(err.issues)
}
```

`parseDescriptor(text, source)` reads text instead of a file;
`descriptorIssues(value)` checks a parsed value and lists its problems without
lines. A folder must start with `~/`, be absolute, and name something below
the home folder or the root, not a home folder itself such as `/home/alice`. A
glob names entries inside its path, in every `{a,b}` alternative too, and a
project `marker` names a file in every alternative. A tool's
`command` must name the checked folder, as a `{path}` argument or in `env`, and
`env` may not set `PATH`, `LD_*`, `DYLD_*`, `NODE_OPTIONS` or `BASH_ENV`.
`paths`, `vars` and `inUse.locks` may use a `${VAR}` that `vars` declares or
that is built in (`HOME` and the `XDG_*` folders); a `${` in any other string
(such as a candidate's `command`, `env` or `glob`, `inUse.processes`,
`detect`'s `onPath`, a `project` entry, or a variable's `command` or `key`) is
refused.
`DescriptorSchema` is the zod schema, and `schemas/descriptor-1.json`, which
the package ships (`@osdlc/host-cleaner/schemas/descriptor-1.json`), is the
same schema as JSON Schema for editors.

`descriptorPlugin(name, descriptor)` turns a checked descriptor into a
`definePlugin` value built only on the kit, with an `idleHours` setting, and
`vars` (a folder per variable) when the descriptor declares variables:

```ts
const d = readDescriptor('pip.yaml')
const plugin = descriptorPlugin('pip', d)
```

- **detect:** its `detect` (`onPath`, `exists`), or any of its folders
  existing. A `system: true` descriptor (`skipReason`) and one whose
  `supersededBy` plugin runs answer `{ active: false, note }`. Otherwise it
  first resolves the variables its folders and locks use, once per survey; a
  folder whose variable has no value is left out, and the note says why. A
  lock whose variable has no value can't be checked, so it refuses every
  candidate (`in-use`).
- **roots:** each of its `paths` for this OS that `pathProblem` passes, as a
  self root. A path may not be a symlink (a trailing `/` is dropped first),
  be or hold home, a personal folder, a target or a checkout, sit outside
  home (unless a variable set in the config, or an `XDG_*` folder the
  environment sets that passes the folder checks, gives it), or hold or sit
  inside host-cleaner's own folders.
- **discover:** one candidate per folder, or per `glob` match inside it
  (`globMatches`; a match may be a file, and `{a,b}` takes either, as in a
  `marker`). Matches past `maxEntries` are
  combined into one candidate at the first of them, held while any of them
  changed within the threshold, and measured together in the time one folder
  gets. `project` entries find build folders beside a marker in the targets'
  checkouts, in one walk, and in a repository's primary checkout only inside
  the targets. A build folder that several `project` entries give is one
  candidate, by the longest of their `idleHours` and the highest of their
  costs. An entry's own `idleHours` gives way to the config's
  ([below](#command-line)). Any other folder that two entries give is refused
  (`duplicate-entry`). Home is the run's (`ctx.home`), else `HOME`. It has a
  10 minute limit, which can stop it between two folders.
- **object:** a running `inUse` process or lock refuses its candidates
  (`in-use`); a prune with no program on PATH gets a `no-prune-tool` protest.
- **delete:** checks the candidate again, and that one the plan ran as idle
  is still idle and measured (a prune excepted). A held one a person picked is
  not checked for idle time, unless its entry holds it (`held: true`) or it is
  `lost`: those must be idle now. Then it runs the tool's command
  from the home folder, pointed at the folder, or removes it with
  `kit.remove`. A combined candidate removes each of its matches, none when
  one is no longer idle. One that cannot be removed does not stop the others,
  and the error says which went.

A descriptor whose `supersededBy` plugin runs is told so by `ctx.running`,
which holds only the plugins before it in `survey`'s list: put a descriptor
after the plugin it names.

To load descriptors from folders and files, as the command line does:

```ts
import { findPlugins, loadPlugins } from '@osdlc/host-cleaner'

const sources = { user: '/home/me/.config/host-cleaner/descriptors', flag: ['/tmp/uv.yaml'] }
// The built-ins, then one definition per descriptor by name; a name whose file
// can't be used is one of `problems`, with its `error`.
const { definitions, descriptors, problems } = findPlugins(sources)
// The same, but the first problem is thrown.
const loaded = loadPlugins(sources)
```

`sources` names the shipped folder (`shipped`, default `SHIPPED_DESCRIPTORS`),
the user's (`user`, none when unset) and single files (`flag`). Each of
`descriptors` (`LoadedDescriptor`) says its `name`, `source`, `path`, the file
it `replaces`, and the checked `descriptor`. `findDescriptors(sources,
builtIns)` and `loadDescriptors(sources, builtIns)` give the descriptors alone,
with no plugin built: `find…` collects each `DescriptorProblem` (`name`,
`path`, `error`), and `load…` throws the first. A clash of names is a
`DescriptorLoadError`, a file that is no descriptor a `DescriptorError`; a
descriptor folder that can't be read throws `DescriptorLoadError` from all four.

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
host-cleaner plugins [target...] [--format json]   # every plugin: where it came from, detected or why not, its roots
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
take that form, also when `HOME` goes through a symlink. `status`, `plan`, `clean` and `plugins` refuse to run as root (exit 1); `config` still answers. `status`,
`plan` and `clean` print each plugin's `detect` note as a warning line naming
the plugin, with the survey's warnings.

`--plugin <name>` runs only those plugins and
`--skip-plugin <name>` never runs these. Targets default to the config file's
`targets`, then the directory you are in. `clean` re-checks, shows the steps,
asks (`--yes` skips the question; with no terminal and no `--yes` it exits 2),
deletes, and writes one receipt to `--receipt` or the state directory's
`receipts/`, plus a line in `logs/host-cleaner.log`.

Descriptors (plugins written as YAML or JSON files) come from three places,
and each file's name, less `.yaml`, `.yml` or `.json`, is its plugin name: the
package's `descriptors/`, `descriptors/` in the config directory, and
`--descriptor <file>` for one run. A file in the config directory replaces a
shipped one of the same name, and `--descriptor` replaces either for that run.
Every plugin has one name, so any other clash, such as a descriptor named `git`
or two files of one name in one folder, is a file that can't be used. Descriptors
run after the built-ins, by name. To try one you are writing:
`host-cleaner status --descriptor ./uv.yaml --plugin uv`. A plan records the
`--descriptor` files behind the plugins it ran, not those the run left out.
`clean --plan` does not load them by itself: when one is not given it stops
(exit 2) and names each `--descriptor` flag to add. A descriptor's `supersededBy` must name a built-in plugin.

`config` reports a descriptor file that can't be used (not a descriptor, a name
that is no plugin name, or a name clash) and goes on. `status`, `plan` and
`clean` stop (exit 2) unless the run leaves that name out (`--skip-plugin`,
`--plugin` naming others, or `enabled: false`), and then warn of it. `--config
<file>` replaces the config file alone: descriptors still come from the config
directory. When that directory can't be found, such a run has no user
descriptors, with a warning.

The package ships eight, for macOS and Linux: `pnpm` (the store, pruned with
`pnpm store prune`, and the metadata cache), `uv` (the cache, pruned with
`uv cache prune`), `huggingface-hub` (one candidate per model, dataset or space,
after 30 idle days; models are held, so one goes only when picked), `gradle`
(the caches after a week and each wrapper distribution after 30 days; wrapper
distributions are held, so one goes only when picked), `npm` (the package
cache), `pip` (the cache), `yarn` (Classic's global cache; Berry's is left out,
since Plug'n'Play projects run from it) and `maven` (the local repository, at
the cost `rebuild`; always held, so it goes only when picked). While the tool
runs, every candidate of `pnpm`, `uv`, `gradle` (any Gradle build or daemon),
`npm` (npm or npx), `pip` (pip, pip3 or `python -m pip`), `yarn` and `maven`
(mvn, `./mvnw`, mvnd or any process naming `maven`, such as IntelliJ's Maven
server) is refused as `in-use`, at the survey and again before each delete, so
a long-running `pnpm dev` keeps the pnpm store from being pruned. Idle time is
the newest modification time inside a folder, and reading a file doesn't change
it: a Hugging Face model or a Gradle wrapper distribution in daily use counts as
idle from its download, which is why they are held. So does a Maven repository
whose artifacts are all downloaded, and it may hold what only a local
`mvn install` gives back, which is why it is held too. Each looks only at the
tool's default folders: a store moved by an environment variable or a setting is
not found, and the folder it left behind, if any, is what gets cleaned.

A descriptor finds a moved folder with variables: `${NAME}` in a `paths` entry,
a lock, or another variable's `file` or `value`. Each variable lists sources,
tried in order on every survey; the first that gives an absolute folder wins:

```yaml
vars:
  GOPATH:
    - env: GOPATH
    - value: ~/go
  GOMODCACHE:
    - env: GOMODCACHE # an environment variable
    - command: [go, env, GOMODCACHE] # one line of output; argv only, run from home, 5 s limit
    - { file: ~/.config/go/env.toml, key: cache.mod } # a dotted key in a TOML, JSON or YAML file
    - value: '${GOPATH}/pkg/mod' # a fixed folder, per OS or `all`
paths:
  modcache: { all: '${GOMODCACHE}' }
```

`HOME`, `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_CONFIG_HOME` and
`XDG_STATE_HOME` are built in; each `XDG_*` folder falls back to its XDG default
under home on every OS. A variable is resolved only when a folder or lock on
this OS uses it, or another such variable uses it; variables that don't use each
other are resolved at the same time. A `detect` that its `onPath` conditions
already leave inactive resolves none, and a `file` source is read only when it
is a regular file, and given up on after the command limit. A folder whose
variable has no value is left out, and `status` notes which variable and why
each source gave none. `${` is refused in every other field, such as a
candidate's `command`: a command is pointed at its folder with `{path}`. A
resolved folder must sit inside home, except one under a variable set in the
config's `plugins.<name>.vars`, which is trusted, so a cache moved to another
disk can be cleaned. An `XDG_*` folder your environment sets is trusted too, as
your own setting, with nothing in the config: a folder under
`XDG_CACHE_HOME=/var/cache`, say, may be cleaned. Either must pass the checks on
a descriptor's folders (no `..`, not a home folder or a root):

```json
{ "plugins": { "go": { "vars": { "GOMODCACHE": "/Volumes/build/go/mod" } } } }
```

`resolveVars(declared, at)` resolves a descriptor's `vars` outside the engine
(`VarSource`, `VarsAt`): each variable's `value`, the source it came `from`,
whether it is `trusted`, and each source `tried` before it (`VarValue`, in
`Vars`). `fillTemplate(template, vars, home)` fills one folder from them.
`BUILT_IN_VARS` lists the built-ins with their defaults under home, and
`VAR_COMMAND_LIMIT_MS` (5 s) is how long a command may run, or a file be read:

```ts
const vars = await resolveVars(d.vars ?? {}, { home, os: 'linux', env: process.env, kit, signal })
const store = fillTemplate('${STORE}', vars, home) // { path, trusted }, or { missing }
```

The config is `config.json` in the config directory (`HOST_CLEANER_ROOT` moves
all three directories):

```json
{ "targets": ["~/dev"], "plugins": { "cargo": { "idleHours": 48 }, "node": { "enabled": false } } }
```

`plugins.<name>` holds that plugin's settings. A name that no plugin has, such as
a descriptor given only by `--descriptor`, is a warning for `status`, `plan` and
`config`, and stops `clean` (exit 2). Each plugin's settings are a strict schema,
checked when the config loads: a misspelt key or a wrong type is refused (exit 2),
naming the plugin and the key.

| Setting | Plugins | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | every plugin | `true` | `false` leaves the plugin out of every run. `--plugin <name>` runs it anyway. |
| `idleHours` | `cargo`, `node`, every descriptor | the top-level `idleHours`, else `24` | Hours an artifact must have sat unused before it is a candidate; `0` or more, and `0` takes every artifact. |
| `vars.<NAME>` | descriptors that declare `vars` | none | A folder (`~/…` or absolute) for one of the descriptor's variables. It wins over every source and may sit outside home. A name the descriptor does not declare is an error. |

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
  set its own. `0` is allowed and makes every idle-checked artifact a candidate,
  except where a descriptor entry's own `idleHours` is higher (below).

A descriptor entry may carry its own `idleHours`, such as the 168 of Gradle's
caches. A `plugins.<name>.idleHours` you set wins over it, higher or lower. A
top-level `idleHours` you set can only raise it: `"idleHours": 0` leaves Gradle's
caches at 168 hours, `"idleHours": 1000` takes them to 1000. With neither set,
the entry's own value applies.

`host-cleaner config` prints every plugin's effective settings: the value, and
whether the file set it or it is the default. Under a descriptor's `idleHours`
it prints each entry with its own value and the threshold the run applies to it
(to a prune entry only when its program is not on PATH and the folder is
removed whole).
`--format json` prints the values, and those thresholds under `partIdleHours`.

`host-cleaner plugins` lists every plugin: where it came from, each plugin by its
own origin (`built-in` when host-cleaner ships it, even when a program passes it
to `main` or a copy of it; for a descriptor `shipped`, `user` for the config
directory or `flag` for `--descriptor`; and `given` for a plugin the program
wrote, or one of host-cleaner's whose hooks it replaced), whether it applies
here and, when it does not, why, and its roots, the folders it may delete in
besides the targets. When it does not apply, a reason follows if one is known:
disabled, or what `detect` threw. A `detect` that just answers no, as most
built-ins do, gives no reason: it shows `not detected`. A descriptor that
stands in for one of the same name ends its line with the file it replaces
(`replaces` in JSON). The ignored directories (`--ignore` and the config's
`ignore`), which may leave out a target, show after `ignoring:`, as in `status`;
the JSON has them as `ignore`. It runs `detect`, `scope` and `roots` and nothing
else, so it proposes and deletes nothing. It asks the plugins one after
another, so each hook that hangs adds its time limit (30 seconds unless the
plugin asks for another). A note its `detect` gives follows the plugin's state
(`; note: ...`), whether it is detected or not, so a degraded plugin
(`{ active: true, note }`) shows as detected with its note, as Orca installed
but not running does, and a descriptor that is `system: true` or superseded says
so there; the JSON row has it as `note`. A root the core refuses is left out
with a warning, as `status` does, and a self root is marked `(itself too)`. A
detected plugin with no roots shows `none, the targets alone`, followed in
parentheses by why when its `roots` threw, timed out or had every root refused
(`rootsFailed` in JSON): its candidates outside the targets are then refused.
Git is asked once per target only when a plugin gives a root to check.
`plugins` runs no `discover`, where a sweep asks `roots` after it, so a root a
plugin takes from what it found (git's gone worktrees) shows in `status` and
not here. A plugin the config disables is listed as `disabled`, and its
`detect` is not run; its JSON `reason` is `plugins.<name>.enabled is false`,
and the text adds that status, plan or clean with `--plugin <name>` runs it
anyway. A descriptor that can't be used has a row of its own, from where the
file was found, not detected, with why as the reason; for one the config
disables, why is a warning. One named as a built-in plugin is a warning alone,
as a config entry that names no plugin is, as in `config`.

Under a descriptor with variables, one line per variable its folders and locks
use on this OS, built in or declared: its value and the source that gave it,
then each source tried before it and why it gave none. A command that timed out
says so, and the source after it that gave the value is the one named. A
variable no source gave a value has no value; its folders are left out, and the
note says so. The variables come with `detect`'s answer, so a descriptor whose
`detect` threw, timed out, was skipped or was superseded shows none, as does
one whose `onPath` conditions alone leave it undetected. Each line
keeps to itself: a line break in a value is printed as a space. `--format json`
prints the same, one object per plugin, each with its `vars`.

```text
targets: /Users/me/dev
  git    built-in  detected; roots: none, the targets alone
  cargo  built-in  detected; roots: none, the targets alone
  node   built-in  disabled: plugins.node.enabled is false; status, plan or clean with --plugin node runs it anyway
  orca   built-in  detected; roots: none, the targets alone; note: Orca is installed but not running
  go     user      detected; roots: /Users/me/go/pkg/mod (itself too)
    ${GOPATH}      = /Users/me/go  from value (tried env GOPATH: not set)
    ${GOMODCACHE}  = /Users/me/go/pkg/mod  from value (tried env GOMODCACHE: not set; command go env GOMODCACHE: timed out after 5 s)
```

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
