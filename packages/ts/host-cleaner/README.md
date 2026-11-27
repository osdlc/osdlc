# @osdlc/host-cleaner

Machine cleanup as plugins. A plugin proposes **candidates** (things that could
be deleted) and **objects** to candidates. The core decides what runs, checks
again, and has each owner delete its own candidates, with one flat plan and one
receipt. The `git` plugin is [`@osdlc/repo-cleaner`](../repo-cleaner/README.md):
its sweep supplies worktrees and branches, and its `removeCandidate` deletes them,
under repo-cleaner's safety model.

This release is the library, the `git`, `cargo`, `node`, `vscode`, `cursor`, `orca`, `docker`, `ollama`, `agent-history`, `jetbrains` and `toolchains` plugins, and the `host-cleaner` command.
It runs only when a person runs it: there is no scheduled or unattended run
([B-0001](docs/planning/backlog/B-0001-unattended-cleaning.md)).

[docs/guide/how-it-works.md](docs/guide/how-it-works.md) says how the package is built.
The design it is heading to, descriptors and loadable plugins included, is the
[system description](../../../docs/architecture/host-cleaner-system.md).

## Phases

Plugins run in the order they are given. The command line runs the shipped
ones, `BUILT_IN_PLUGINS`, in that list's order: `git`, `cargo`, `node`, `vscode`, `cursor`, `orca`, `docker`, `ollama`, `agent-history`, `jetbrains`, `toolchains`.
The order decides which plugin keeps a duplicate, and the order `prepare` and `deleted` run in.

Each shipped plugin is one `definePlugin({ name, api, settings, create })`
value: `api` is `PLUGIN_API`, `settings` is the zod schema of its entry in the
config's `plugins` (the core adds `enabled` and makes it strict), and `create`
builds the plugin from those settings, validated with defaults filled in, and
the plugin kit (see [The plugin kit](#the-plugin-kit)). A plugin of your own is
written the same way, from `@osdlc/host-cleaner/plugin`, which holds
`definePlugin`, `PLUGIN_API`, the contract's types, the kit, `CommandFailed`
and `z` (the zod the core validates settings with), and nothing of the run; the
main entry exports all of it too. [Writing a
plugin](./docs/guide/writing-a-plugin.md) is the guide: writing, testing and
publishing one.

```ts
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import { PLUGIN_API, definePlugin, z } from '@osdlc/host-cleaner/plugin'

export default definePlugin({
  name: 'scratch',
  api: PLUGIN_API,
  // The core refuses a root that is not absolute.
  settings: z.object({ dir: z.string().refine(isAbsolute, 'dir must be an absolute path') }),
  create: ({ settings, kit }) => ({
    name: 'scratch',
    detect: () => true,
    roots: () => [settings.dir],
    discover: () => {
      const out = join(settings.dir, 'out')
      return existsSync(out) ? [kit.candidate({ kind: 'scratch', path: out, why: 'built' })] : []
    },
    delete: (c, ctx) => kit.remove(c.path!, ctx),
  }),
})
```

| Phase | Who | What |
| --- | --- | --- |
| scope | each plugin | adds roots to look in; the only way a plugin adds a repository |
| discover | each plugin | proposes candidates; two with the same id, or path candidates with the same real path, are one: the first plugin's stands, with a warning naming both |
| object | each plugin | objects to any candidate; sees no other plugin's objections |
| decide | core | `refuse` blocks, `protest` needs `--allow <code>`, `note` does not gate |
| re-check | core | discovers and objects again; a candidate now refused is `blocked`, a protest not granted `not-allowed`, a vanished one `gone`, one whose evidence moved, that its owner holds now and did not in the plan, or a `capped` one that grew, `changed`; a plan with a candidate whose owner is no known plugin throws `StalePlan` |
| prepare | every plugin | before the delete; a throw stops only that candidate, a `FatalRun` stops the run. `ctx.run` holds the candidates the run deletes. A returned sentence is kept in the step's `prepared`, even if the candidate then fails |
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
inside it that does not run and what would let it run. Its wording, and where
it shows, are under [nesting](docs/guide/how-it-works.md#nesting) in
how-it-works.

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

`recheck(plan, plugins, ctx, known)` and `clean`'s `known` option name every
plugin the install has, left-out ones too; they default to the names in
`plugins`. A plan candidate whose owner `known` lacks throws `StalePlan` and
nothing runs: sweep again. A known plugin left out of `plugins` has its
candidates dropped as `gone`, so a caller that passes only some plugins passes
`known` as well:

```ts
clean(saved, [git], ctx, { known: ['git', 'cargo'] }) // cargo's candidates are `gone`
```

What a plan runs uses repo-cleaner's words, with their meaning:

- **The default:** every candidate nothing refuses or protests and no owner
  holds for review (`held: true`).
- **`select`:** exactly these candidate ids instead of the default.
- **`pick`:** these as well; a candidate held for review runs only when picked
  or selected. One the plan did not hold and its owner holds at the re-check is
  dropped as `changed`, picked or not; one held in the plan and held no longer
  still runs.
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

The core refuses a root, plain or self, that is not an absolute path or has a
`..` in it, is the filesystem root (`/`), is or holds the home folder, is a
personal folder (`PERSONAL_FOLDERS`: `~/Documents`, `~/Desktop`,
`~/Downloads`, `~/Pictures`, `~/Music`, `~/Movies`, `~/Library`, `~/.ssh`,
`~/.config`), is or holds a target or a linked worktree, or is a checkout
(holds `.git`), and a self root that is a symlink. It leaves such a root out
with a warning (`<plugin>: roots: left out the root <path>: <why>`), so its
candidates are refused `outside-roots`. The same check runs again right before
`delete`, against the linked worktrees git lists then, and in `kit.remove`, so a
self root that has become a checkout or a symlink since the survey, or a root
that now holds a new linked worktree, is not removed.

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
(`pluginKit(name, options)` builds one, for tests; both entries export it). Each run, once the
plugin's `roots` hook has answered, the core binds the kit it was created with
to those roots, the run's targets and their linked worktrees (as above), so `kit.remove`
needs no more than the path. The plugin `create` returns through
`definePlugin` is tied to its kit, and `cargoPlugin` or `nodePlugin` called
without it to the kit it builds; a kit no run has bound removes nothing.

| Helper | What it does |
| --- | --- |
| `kit.idle(path, { skip })` | How long the folder sat unchanged: the newest modification time under it and the hours since, fractions included, links not followed, within a time budget (`MEASURE_BUDGET_MS`, 10 seconds). Several folders, as a list, are one answer within one budget. A path that is a file is aged by itself. Out of time, it is `{ unmeasured: true }`. |
| `kit.overBudget()` | A check that turns true once the same budget has passed since the call, by the kit's clock: for a plugin that measures several things as one. |
| `kit.now()` | The time now, by the clock `kit.idle` reads (`KitOptions.now`). |
| `kit.size(path)` | Bytes on disk, by repo-cleaner's `sizeOf` (`du`) within the same budget; `null` when unread. |
| `kit.running(name \| { name } \| { in }, ctx)` | The processes of a program, by name, or the busy processes working in a folder (an idle shell is not busy), as `names` (`<command> (pid <n>)`, for a sentence) and `processes` (`{ pid, command }`, to match on); `unknown` when the process table cannot be read. A name matches a word of a process's command line (`ps -axo pid=,ppid=,args=`): a word whose last path segment is the name or has it as one of its dot-separated parts (`commandHasName`). So `pnpm` finds `node /opt/homebrew/bin/pnpm dev` and corepack's `.../pnpm.cjs`, and `GradleDaemon` or `gradle` finds `java ... org.gradle.launcher.daemon.bootstrap.GradleDaemon`. Case counts. host-cleaner's own process and the unbroken line of ancestors above it whose command lines name host-cleaner are left out, so the `npm exec` or `pnpm dlx` that started it does not count, but an editor, terminal or `tmux` it runs inside does. The table is read fresh once per hook call; one that could not be read stays `unknown` for the rest of it. |
| `kit.alive(pid, startedAt?)` | Whether a process is running, by the process probe's `alive`. With `startedAt` (such as epoch milliseconds recorded when it started), a pid reused by a process that started later is not it. `true` when it cannot be told. |
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

A candidate whose delete takes whatever is there by then, as a prune does, sets
`capped: true`. The re-check drops one whose `bytes` are more than the plan
showed as `changed`; fewer are fine.

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
`detect`'s `onPath`, a `project` entry, or a variable's `command`, its `env`
or `key`) is refused.
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

### Loading plugins from code

The command line builds its plugin list from these exports, and a program that
runs `survey` and `clean` itself can do the same:

| Export | What it does |
| --- | --- |
| `packageEntries(config.plugins)` | The `plugins` entries with a `package`, by name. Throws `PackageError` for one that is not an npm package name or is named as a built-in plugin. |
| `packageRoots(env)` | The `node_modules` folders a package is looked for in, in order. |
| `loadPackages(entries, roots)` | Imports each entry's package: `{ loaded, failed }`. A failure is a `PackageFailure`, not a throw. |
| `loadDescriptors({ shipped, user, flag }, reserved)` | The descriptors a run uses, each with its `source` and the file it `replaces`. Throws `DescriptorLoadError` for a name clash, `DescriptorError` for a bad file. |
| `loadPlugins(sources, opts, { loaded, entries })` | The built-ins, then the packages, then one `descriptorPlugin` per descriptor: `{ definitions, packages, descriptors }`. Throws `PackageError` for a package named as a built-in plugin, and as `loadDescriptors`. |
| `findPlugins(sources, opts, { loaded, entries })` | As `loadPlugins`, but a descriptor that can't be used is one of `problems`, not a throw. |
| `parseDescriptor(text, source)`, `readDescriptor(path)` | One descriptor, checked; `DescriptorError` lists each issue with its field and line. `descriptorIssues(value)` returns them instead. |
| `descriptorPlugin(name, descriptor, opts)` | The `PluginDefinition` for one descriptor. |
| `DescriptorSchema`, `descriptorJsonSchema()` | The format as a zod schema and as the JSON Schema in `schemas/descriptor-1.json`. |

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loadPackages, loadPlugins, packageEntries, packageRoots } from '@osdlc/host-cleaner'

const entries = packageEntries(config.plugins)
const { loaded, failed } = await loadPackages(entries, packageRoots(process.env))
const user = join(homedir(), '.config', 'host-cleaner', 'descriptors')
const { definitions } = loadPlugins({ user }, {}, { loaded, entries })
```

`sources` names the shipped folder (`shipped`, default `SHIPPED_DESCRIPTORS`),
the user's (`user`, none when unset) and single files (`flag`). Each of
`descriptors` (`LoadedDescriptor`) says its `name`, `source`, `path`, the file
it `replaces`, and the checked `descriptor`. `findDescriptors(sources,
builtIns)` is `loadDescriptors` that collects each `DescriptorProblem` (`name`,
`path`, `error`) instead of throwing the first. A descriptor folder that can't
be read throws `DescriptorLoadError` from it, `loadDescriptors`, `findPlugins`
and `loadPlugins`.

A descriptor whose `supersededBy` plugin runs is told so by `ctx.running`,
which holds only the plugins before it in `survey`'s list: put a descriptor
after the plugin it names.

## The `git` plugin

`gitPlugin(options)` proposes repo-cleaner's worktrees, as paths, and branches,
as refs (`ref` the branch's name, `at` its repository). Its
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
yet offered here. Its `delete` refuses a worktree whose folder has become a
symlink, since `git worktree remove` would follow it and empty the folder it
leads to. Its `discover` sweeps every
repository in one synchronous call, so it has a 10 minute limit.

`BUILT_IN_PLUGINS` holds git as `gitDefinitionWith()`, sweeping worktrees and
local branches. A program that wants other kinds, as `--worktrees` and
`--branches` give the command line, or `archive`, as `clean --archive` does,
puts `gitDefinitionWith({ sweep: { only: ['worktree'] } })` in its place.

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

## The `vscode` plugin

VS Code keeps state for every folder it opened in `workspaceStorage/<hash>/`
and never removes it when the folder goes. Its root is
`~/Library/Application Support/Code/User/workspaceStorage` on macOS and
`~/.config/Code/User/workspaceStorage` on Linux (`$XDG_CONFIG_HOME/Code/...`
when `XDG_CONFIG_HOME` is set), or `$VSCODE_APPDATA/Code/...` on either when
that is set, as VS Code itself finds it; the plugin is detected when that
folder exists (and is not when it is not an absolute path, as with an empty
`HOME`), and has no settings.

| Phase | What it does |
| --- | --- |
| discover | Reads each folder's `workspace.json`. One whose `folder` or `workspace` (a `.code-workspace` file) is a `file:` URI naming nothing on disk is `workspace-storage:<path>`, with its size and `costDescription: re-download`. One that holds chat or agent history is `costDescription: lost` instead, so it is held and runs only when picked with `--allow discard-user-data`: history is a `chatSessions/` chat (VS Code's chats, a `.json` file or a `.jsonl` log) with at least one request, a `chatEditingSessions/<session>/` whose `contents/` has something in it (the file contents an agent's edits changed), anything in the Copilot extension's `GitHub.copilot-chat/transcripts` or `GitHub.copilot-chat/memory-tool/memories`, or a `state.vscdb` with an `interactive.sessions` row holding a chat with at least one request, where VS Code kept chats before `chatSessions/` (one whose bytes name the key is read with `node:sqlite`, and counts unless it can tell that no such row does; then `evidence.history` says why, as `state.vscdb (<reason>)`). An empty chat file, a chat with no requests, an editing session with an empty or missing `contents/`, and other files in `chatSessions/` do not count; a chat file it cannot parse, and a folder it cannot read, do. The `why` and `evidence.history` name the folders found. A remote URI, a folder with no `workspace.json` (an empty window's), a link, and a path on a volume that is not mounted are left alone. A `workspace.json` of any other shape is never guessed at: the folder is proposed held and refused `vscode-unknown-workspace`, naming what was found, so it shows under `--all-rows`. |
| object | While VS Code runs, or the process table cannot be read, refuses (`vscode-in-use`) a `git` worktree a VS Code process works in (by its working directory, such as a `Code Helper (Plugin)` process an extension started there), one the window state (`User/globalStorage/storage.json`, `windowsState`) names as open, and one a storage folder written since VS Code started names. Both name a worktree by a folder in it or a folder it is in (a window on `/repo` names `/repo/.worktrees/feat`), or by an open `.code-workspace` file's root in it or above it. The window state can miss a window opened since VS Code started; its storage does not. When VS Code's start cannot be read (`ps -o lstart=`), every worktree that storage names is refused; one that none names is not. Its own candidate is refused the same way: when a window still names the gone folder, or the candidate was written since VS Code started (or at any time, when that is not known). A window state, or an open workspace file it names, that cannot be read refuses every worktree and storage candidate not refused already (`vscode-state-unreadable`); a `workspace.json` or workspace file of storage written since that cannot be read refuses every such worktree. A worktree that is not refused and whose processes could not be listed carries a `note` (`vscode-unchecked`). |
| prepare | Checks each `git` worktree and each of its own candidates again as `object` did, right before it is deleted, and fails it when VS Code may now have it open or works in it. Each check reads the process table afresh. |
| delete | Reads the folder's `workspace.json` again, checks it is a folder directly in `workspaceStorage`, its workspace is still gone, and it holds no chat or agent history unless it was planned as `lost`, then removes it with `kit.remove`. |

## The `cursor` plugin

Cursor is a fork of VS Code and keeps the same `workspaceStorage`. The `cursor`
plugin is the `vscode` plugin's code over Cursor's folders,
`~/Library/Application Support/Cursor/User/workspaceStorage` on macOS and
`~/.config/Cursor/User/workspaceStorage` on Linux (moved by `XDG_CONFIG_HOME`
and `VSCODE_APPDATA` as VS Code's is), and over Cursor's processes
(`Cursor`, `Cursor Helper (…)`, `cursor`). It finds, refuses and deletes what
the `vscode` plugin does. Three differences. Cursor keeps its chat history in that
storage, so every dead workspace's folder is `costDescription: lost`, not only
one with the history folders the `vscode` plugin looks for. It is held,
protested `discard-user-data`, and runs only with
`--pick <id> --allow discard-user-data`. Cursor's agents make and track
their own worktrees under `~/.cursor/worktrees`, so the plugin refuses
(`agent-worktree`, exported as `AGENT_WORKTREE`) any `git` worktree there,
whether or not Cursor runs. (For another tool's agent worktrees, list their
folder in the config's `ignore`.) And the `cursor-agent` CLI runs as `node`, so
the process table does not show which process is Cursor's agent: the plugin
refuses (`cursor-in-use`) any `git` worktree that any process other than an idle
shell works in, whether or not Cursor runs. The plugin is detected when its
storage or the agents' folder exists; on a host with only the CLI, that is once
it has made a worktree there. On Windows only the agents' folder is checked. Its
codes are the `vscode` plugin's under its own name: `cursor-in-use`,
`cursor-unknown-workspace`, `cursor-state-unreadable` and `cursor-unchecked`.

```ts
import { CURSOR_PLUGIN, cursorPlugin, cursorUserDir, survey } from '@osdlc/host-cleaner'

// Cursor's `User` folder here: undefined on a platform the plugin does not know.
const userDir = cursorUserDir(process.env, process.platform)
const s = await survey([cursorPlugin({ userDir })], { cwd: process.cwd(), targets: [], allow: [] })
const ofCursor = s.candidates.filter((c) => c.owner === CURSOR_PLUGIN)
```

## The `orca` plugin

Orca keeps its own record of some worktrees and holds terminals and agents open
in them. Removing one with plain git leaves the record and the terminals behind,
so this plugin works beside `git`, which still removes the directory.

Detected when the `orca` CLI is on `PATH` (or at
`/Applications/Orca.app/Contents/Resources/bin/orca`). Orca missing is silent.
When it is installed but not running, or `orca status` fails, prints no JSON or
takes over 20 seconds, Orca cannot be asked, and there is no fallback to git:
every `git` worktree whose real path is under `/orca/workspaces/` is refused
with `orca-unreachable`, and the other worktrees are left to `git`. Orca then
adds no repositories and proposes no records, and `detect` gives the reason as
its note. It never fails the run. Every call goes through
`@osdlc/command-seam` with `--json`.

| Phase | What it does |
| --- | --- |
| scope | Adds each repository `orca repo list` names (`plugins.orca.repos: false` turns this off). |
| discover | A record in `orca worktree ps` whose directory is gone is `orca-record:<path>`, a ref to Orca's record (`at` is the gone directory), held for a pick. |
| object | On a `git` worktree that Orca manages: a `note` with its Orca id; a `refuse` `orca-agent-active` when an agent is at work (any state not `idle` or `done`); a `refuse` `orca-terminal-unverifiable`; a `protest` `close-terminals` when terminals are open. If Orca is running but its worktrees cannot be read, every `git` worktree is refused with `orca-unreachable`; while it cannot be asked at all (above), only those under `/orca/workspaces/` are. |
| prepare | Sees again that no agent is at work, then `orca terminal close --worktree id:<id> --all`. |
| deleted | After `git` removed the directory, `orca worktree rm --worktree id:<id> --force` so Orca forgets the record. It is never asked while the directory exists, since it would delete it. The branch is kept. |

```sh
host-cleaner clean --pick worktree:/path/to/wt --allow close-terminals
```

## The `docker` plugin

Docker's volumes, images and build cache live in its own data folder, which
only Docker knows how to read, so every candidate is a ref and Docker deletes
it itself. The data folder is never touched.

Detected when `docker` is on `PATH` and `docker info` answers. Docker missing is
silent; installed but not running adds a note with Docker's reason, and the
plugin stays out of the run.

| Candidate | Found by | Deleted by | Cost |
| --- | --- | --- | --- |
| `docker-volume:<name>` | `docker volume ls --filter dangling=true`: no container, running or stopped, uses it. Not one named in `plugins.docker.keepVolumes`. | `docker volume rm` | `lost`: held, and runs only when picked with `--allow discard-user-data` |
| `docker-image:<id>` | `docker image ls --filter dangling=true`: no tag. One a container (running or stopped) was made from is left out. | `docker image rm` | `re-download` |
| `docker-build-cache:reclaimable` | The `Reclaimable:` total of `docker builder du`, when it is more than 0. | `docker builder prune --all --force` | `re-download` |

Docker refuses to remove a volume or image a container took up after the
plan, so that candidate fails instead of being deleted. A volume removed and
made again under its name since the plan has another creation time, so the
re-check drops it as `changed`, and the delete looks once more before it removes
anything. Docker gives that time to the second, so a volume made in the ten
minutes before the daemon's clock (`docker info`) is not proposed, and neither
is one Docker gives no creation time for. The build
cache is `capped`: it is pruned only while its `Reclaimable:` total, read again
right before the prune, is no more than was shown. An image's size counts only
the layers no other image shares, from `docker system df -v`, and is left out
when Docker does not say. A volume or image already removed by someone else is
`already gone`, not a failure.

When one of the three listings fails, the other two are still proposed, with a
`not-listed` note on the first candidate saying what failed; with nothing to
propose, it is a warning.

```sh
host-cleaner clean --pick docker-volume:pgdata --allow discard-user-data
```

## The `ollama` plugin

Models that nobody has pulled or changed for `plugins.ollama.idleHours` (default
24, or the config's top-level `idleHours`). Detected when `ollama` is on `PATH`
and its server answers. Each hook first asks the server over HTTP
(`$OLLAMA_HOST/api/version`), because the `ollama` CLI starts the app on macOS
and Windows when the server is down. If the server does not answer, or
`OLLAMA_HOST` names another machine or cannot be read, `detect` leaves the
plugin out and says why in its note. This machine is a loopback or unspecified
address (IPv4-mapped too), its host name, or an address of one of its network
interfaces.

| Phase | What it does |
| --- | --- |
| discover | Each model in `ollama list` is `ollama-model:<name>`, a ref with `costDescription: re-download` and the most its SIZE text can mean (ollama cuts 10 and more to a whole number and rounds less to a tenth unless it is whole, so `19 GB` is up to 20 GB, `3.9 GB` up to 3.95 GB, and `4 GB` is exact). Tags that share an ID share their files, so removing one alone frees nothing: each names the size and the other tags in its reason, the first carries the size when none of them is held, and the rest carry 0 bytes. Models with different IDs may share layers, which `ollama list` does not show, so a size is the most that removing one frees. Its age is the least time the MODIFIED text can mean (`4 days ago` is at least 95.5 hours); a model younger than the threshold, or with an age or size it cannot read, is held for a pick. Cloud models (SIZE `-`), with nothing on disk, are left out. Evidence is the name and the ID. |
| object | A model `ollama ps` shows loaded, by name or ID, is refused `ollama-in-use`. Every other model gets an `ollama-use-unknown` protest. If `ollama ps` fails, or has not answered in 20 s, every model is refused `ollama-ps-failed`. |
| delete | Reads `ollama list` and then `ollama ps` again, the loaded check last because `ollama rm` unloads a loaded model: a model now loaded or with another ID is not removed, one already gone is not a failure. Then `ollama rm <name>`, and checks the list no longer shows it; a list that fails after a successful `rm` is noted in the receipt, not a failure. The receipt says the most it freed, or which tags keep its files. |

ollama records when a model was pulled, not when it was last run, so a model
you run every day can look old. That is why every model carries the
`ollama-use-unknown` protest: nothing is removed until you pass
`--allow ollama-use-unknown`.

```sh
host-cleaner clean --allow ollama-use-unknown
```

## The `agent-history` plugin

Claude Code keeps each project's sessions in `~/.claude/projects/<name>/`
(`CLAUDE_CONFIG_DIR/projects` when that is set, a relative one under the folder
the command runs in; `~` is the run's home folder). When a worktree is removed, its history stays. This
plugin proposes the history of a project whose folder no longer exists, as
`claude-history:<folder>`, with its size.

`<name>` is the project's path with every character but a letter or a digit
turned into `-` (past 200 characters, its first 200 and a hash), which cannot
be turned back. So the path is read from what
the folder records: the first `cwd` of each transcript (`<session>.jsonl`) and
each `projectPath` in `sessions-index.json`. A folder that records no path, or
a path that does not give its name (it was moved, or its records disagree), is
skipped, never guessed, and so is one with a transcript that gives no `cwd` in
its first 4 MiB. A folder is proposed only when every path it records is gone,
and not when that path could be on a volume that is not mounted: the nearest
folder above it that exists is `/Volumes`, `/mnt`, `/media`, `/run/media` or
below one and no volume is mounted between (its device is that folder's), is
a mount point in `/etc/fstab` with nothing mounted on it, or is the root (a path from
another machine, or a drive that is away). A link there is followed, and one
that leads nowhere counts as a volume that is away. A project folder in
`projects` that is a link is skipped; `projects` itself may be one.

History cannot be fetched or built again, so its `costDescription` is `lost`:
it is held, and runs only when picked and allowed:

```sh
host-cleaner clean --pick claude-history:~/.claude/projects/-Users-me-dev-app-wt --allow discard-user-data
```

It is a `refuse` while a Claude Code session in it is running (`live-session`:
a `~/.claude/sessions/<pid>.json` whose process is alive and whose session is
the folder's, or whose `cwd` gives the folder's name, or past 200 characters
the name of a path the folder records; a process that started after the file was last
written, and after its `startedAt`, reused the pid and does not count), while a
process still works in the gone folder (`live-process`; macOS gives no name for
a removed folder, so there such a process is not seen), or when either cannot
be read (`session-state-unreadable`, `process-table-unreadable`). `delete` reads the folder and the sessions again,
then removes it with `kit.remove`. No settings.

Codex is left out: it keeps sessions by date
(`~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`), with the working
folder inside each file, so it has no folder per project to remove.

## The `jetbrains` plugin

JetBrains IDEs keep a cache and a log folder per version, and caches per
project inside it. The IDE rebuilds the caches when needed
(`costDescription: rebuild`); nothing rebuilds the macOS log folders (`lost`),
so they wait for a pick. Roots: `~/Library/Caches/JetBrains` and
`~/Library/Logs/JetBrains` on macOS, `~/.cache/JetBrains` (or
`$XDG_CACHE_HOME/JetBrains`) on Linux, under the core's `home` when it is set,
else `HOME`. Detected when one of them exists.
Settings: `plugins.jetbrains.idleHours` (default 24).

- `ide-version:<path>`: a version folder, such as `RustRover2025.1`, that no
  install names. An install is known by `dataDirectoryName` in its
  `product-info.json`, read from each tool the Toolbox's `state.json` lists and
  from the application folders (`/Applications` and `~/Applications` on macOS;
  the Toolbox's `apps` folder, `/opt`, `/usr/local`, `/usr/share`, snaps under
  `/snap`, `~/opt`, `~/.local/share`, `~/Applications`, `~/bin`, `~/tools`,
  `~/Downloads` and the home itself on Linux), and from the install each `jetbrains-*.desktop` entry starts
  (`Exec=<install>/bin/...`, in `~/.local/share/applications`,
  `/usr/local/share/applications` and `/usr/share/applications`). It is held
  while it changed within `idleHours`, in case an install sits somewhere not
  looked in; one used again between plan and clean is dropped as changed. A
  Toolbox state or `product-info.json` that is there and cannot be read refuses
  every version folder (`installs-unreadable`), and so does a Toolbox install
  of an IntelliJ-platform IDE (it has a `bin/idea.properties`) with no
  `product-info.json`, or whose `product-info.json` has no
  `dataDirectoryName`; a Toolbox tool with neither file, such as Fleet, or one
  whose `dataDirectoryName` is no `<Product><year>.<n>`, which no version folder
  can be, is passed over. In the application folders, an
  entry that cannot be looked into, or whose `product-info.json` names no
  `<Product><year>.<n>` folder, is taken as some other app and passed over.
- `project-cache:<path>`: inside an installed version, `projects/<name>.<hash>`
  whose project is gone. The hash is Java's `String.hashCode` of the project's
  path, matched against the version's recent projects
  (`options/recentProjects.xml` in its config folder). It is held while it
  changed within `idleHours`, as a project missing for a moment (a share that
  is down, a checkout being cloned again) still uses its cache. A cache whose
  hash matches no recent project is left alone, and so is a project on a volume
  that is not mounted: under `/Volumes`, `/mnt`, `/media`, `/run/media` or
  `/net`, a missing project is gone only when its nearest existing folder is on
  a mounted volume of its own, inside that mount folder.

A running process of the product (`rustrover`, `idea`, and so on, or
`rustrover64` as in the `.vmoptions` file a Linux `.sh` launcher passes to
`java`), whatever its version, or a process table that cannot be read, is a
`refuse`. Folders other than version folders, and links, are never looked into.
`delete` finds the folder again and checks its idle time and processes, then
removes it with `kit.remove`. `jetbrainsPlugin(options, kit)` builds the plugin
directly, with `apps`, `desktop` or `platform` of your own.

## The `toolchains` plugin

rustup toolchains, and Node versions installed by nvm or Volta, that no
checkout in your targets asks for. Each is `rust-toolchain:<folder>` or
`node-version:<folder>`, with its size and `costDescription: re-download`;
a Node version holding global packages npm installed (other than `npm` and
`corepack`), or whose packages cannot be listed, is `lost`, since they go with
it: it is held, and runs only when picked and with `--allow discard-user-data`.
Settings: `plugins.toolchains.idleHours`, which inherits the top-level
`idleHours` (default 24).

- Nothing is proposed unless you gave the targets, in the config or on the
  command line. When the command line falls back to the folder you run from,
  the plugin proposes nothing and `status` warns
  `toolchains: no targets were given (the folder it runs from is not enough), so it proposes nothing`.

- The checkouts under the targets are read for `rust-toolchain`,
  `rust-toolchain.toml`, `.nvmrc`, `.node-version` and `package.json`'s
  `volta.node` (through `volta.extends` too), at their root and wherever git
  lists one below it. That is the whole repository a target sits in, every
  checkout up to 8 folders below a target, each repository's worktrees (a bare
  one's too), and the submodules of a checkout and the repositories up to 3
  folders below a folder it does not track. A target that is a link is
  followed. A target with folders deeper than 8 refuses every candidate, since
  a checkout may sit there, and so does one that is missing or not a folder
  that can be read.
- Not searched: folders whose names start with a dot, and folders a checkout's
  git ignores. Every candidate carries an `unsearched-folders` note that says
  so. When a repository a target sits in is the home folder, or holds it, its
  own files are read, and what it does not track only in the targets.
- A folder whose `.git` is broken (a pruned worktree's, an empty one) has no
  git to list it, so all of it is read but its `node_modules` (only the
  targets in it, when it is or holds the home folder). A repository found
  inside a checkout has its linked worktrees read too, wherever they sit.
- Kept: what they name, by prefix (`1.80` keeps `1.80-<host>` and
  `1.80.1-<host>`; `18` keeps every `18.x.y`), rustup's default, its directory
  overrides, `RUSTUP_TOOLCHAIN` and the pin files in the folder you run
  from and above it, nvm's `default` alias, Volta's default, and the `node` on
  `PATH` (asked with `node --version`; Volta's shim is passed over, since it
  installs a version it lacks). With no rustup default set, none is kept
  as the default. nvm aliases such
  as `lts/*` are followed through nvm's `alias` folder, and `node` or
  `latest` keep the newest version nvm has.
- Also kept: any version used in the last `idleHours`, so `cargo +nightly`
  with no pin file keeps nightly while you use it. Used means the newest
  access or modification time of the files in the version's `bin` folder,
  links followed. Every use runs one of them (rustup's proxies, nvm's `PATH`,
  Volta's shims), and running a file updates its access time. Linux's
  default `relatime` updates the access time at most once a day, so on a
  volume mounted `relatime` a version is kept for 24 hours past `idleHours`.
  A backup or indexer that reads those files only
  makes a version look used, and keeps it.
- On a volume mounted `noatime` a run leaves no trace, so a versions folder
  there proposes nothing, and `status` warns
  `toolchains: <folder> is on a volume mounted noatime, so last use can't be measured and every version in it is kept`.
  The volume is the one `df` names for the folder, and its options come from
  `mount` on macOS and `/proc/self/mounts` on Linux. When they cannot be read
  (`df` or `mount` failing, another platform), the access times are
  trusted, except on macOS.
- macOS stops updating a file's access time once it is newer than its
  modified time, so after a version's first use there its access times cannot
  show a recent one: unless the volume is mounted `strictatime`, a versions
  folder on macOS proposes nothing either, and `status` warns
  `toolchains: <folder> is on a macOS volume, which stops updating a file's access time once it is newer than its modified time, so last use can't be measured and every version in it is kept`.
- A version with a process working in its folder (one whose current
  folder is in it, an idle shell aside) is refused `live-process`, and every
  version is refused `process-table-unreadable` when that cannot be read, as
  the `cargo` and `node` plugins refuse an artifact. A process started from a
  version's `bin` that works in another folder is not seen this way.
- Checkouts are listed only when some installed version is past
  `idleHours`; when none is, nothing is proposed and git is not asked.
- As a library: `toolchainsPlugin(kit, env, { idleHours, mountOptions, platform })`
  builds it on your kit, reading `HOME`, `RUSTUP_HOME`, `NVM_DIR` and
  `VOLTA_HOME` from `env` (one set empty counts as unset). Idle time is
  read from `kit.now()`.
- When any of that cannot be read (an alias nvm does not have, a checkout git
  cannot list, rustup not answering), every candidate of that tool is refused
  with `unused-unknown` (nvm's default refuses only nvm's versions, Volta's
  only Volta's, a `package.json` that cannot be read, or that names `volta` and
  is not JSON, only Volta's, and any other pin or the `node` on `PATH` both); a
  version whose `bin` folder cannot be read is refused on its own. A linked
  toolchain or one that is not a release is never proposed.
- `delete` reads everything again, then runs `rustup toolchain uninstall
  <name>` for a toolchain, or removes an nvm or Volta folder with
  `kit.remove`. The list of checkouts and pin files alone is kept, for a minute
  from when it was made, so a clean of many versions does not ask git about
  every checkout each time: until then a new checkout, or a new pin file below
  a checkout's root, is not seen. It refuses a folder that is not in the tool's
  versions folder or has become a link, and a Node version whose global
  packages changed. A version pinned or used since the plan is gone at that
  check, and is left alone.

Locations come from `RUSTUP_HOME`, `NVM_DIR` and `VOLTA_HOME`, else `~/.rustup`,
`~/.nvm` and `~/.volta`.

## Command line

The command works in repo-cleaner's phases, with its flags. Nothing runs until
a phase is named; the bare command explains them and exits 2.

```sh
host-cleaner status [target...]   # every candidate, what deleting it costs, and what objects to it; deletes nothing
host-cleaner plan -o plan.json
host-cleaner clean [--plan plan.json] [--pick <id>] [--spare <id|name|glob>] [--allow <code>] [--archive [--archive-exclude <glob>]] [-i] [--yes | --dry-run]
host-cleaner config [--format json]   # every plugin's effective settings
host-cleaner plugins [target...] [--format json]   # every plugin: where it came from, detected or why not, its roots
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

The text output writes the home folder in an id as `~`
(`worktree:~/dev/wt`, `branch:~/dev/repo:main`), and `--pick` and `--spare`
take that form, also when `HOME` goes through a symlink. `status`, `plan`, `clean` and `plugins` refuse to run as root (exit 1); `config` still answers. `status`,
`plan` and `clean` print each plugin's `detect` note as a warning line naming
the plugin, with the survey's warnings.

`--plugin <name>` runs only those plugins and `--skip-plugin <name>` never
runs these.
Targets default to the config file's `targets`, then the directory you are in.
`clean` re-checks, shows the steps, asks (`--yes` skips the question; with no
terminal and no `--yes` it exits 2), deletes, and writes one receipt to
`--receipt` or the state directory's `receipts/`, plus a line in the log. It
deletes only what it showed as `delete`: one it showed as `skip` stays, even
when what blocked it clears before the delete, and the receipt lists those
skips ahead of its own (the library's `clean` takes them as `dropped`).
`clean --plan` drops, as `gone`, a planned candidate no plugin proposes now,
as one of a plugin the run skips. It refuses a plan whose candidates belong to
a plugin this install does not have (exit 2): sweep again with `plan`.

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
(exit 2) and names each `--descriptor` flag to add. A descriptor's
`supersededBy` must name a built-in plugin, or a package the config names.

`config` reports a descriptor file that can't be used (not a descriptor, a name
that is no plugin name, or a name clash) and goes on. `status`, `plan` and
`clean` stop (exit 2) unless the run leaves that name out (`--skip-plugin`,
`--plugin` naming others, or `enabled: false`), and then warn of it. `--config
<file>` replaces the config file alone: descriptors still come from the config
directory. With no home directory to place that directory in, such a run has
no user descriptors, with a warning.

A descriptor names its folders per OS under `paths`, then lists what may be
deleted under `candidates`:

```yaml
descriptor: 1
paths:
  hub: { all: ~/.cache/huggingface/hub }
candidates:
  - path: hub
    glob: 'models--*/' # one candidate per match; past maxEntries (200) the rest are one
    costDescription: re-download
    idleHours: 720
```

A candidate deletes its folder, or with `command` runs the tool's own command
(naming the folder as `{path}`), with `removes: unused` for a prune or
`removes: all` for a wipe. `inUse` lists `processes` and `locks` that make every
candidate wait, `project` adds folders inside each checkout of the targets, and
`detect` (`all` or `any` of `onPath` and `exists`) decides when it runs. A
descriptor with `system: true` never runs, nor one whose `supersededBy` names a
built-in or package plugin that runs this time; `status` gives a note for
each. Every folder must sit inside home and pass the same checks as a plugin's
root. The full format is the JSON Schema in `schemas/descriptor-1.json`.

The package ships these, for macOS and Linux: `pnpm` (the store, pruned with
`pnpm store prune`, and the metadata cache), `uv` (the cache, pruned with
`uv cache prune`), `huggingface-hub` (one candidate per model, dataset or space,
after 30 idle days; models are held, so one goes only when picked), `gradle`
(the caches after a week and each wrapper distribution after 30 days; wrapper
distributions are held, so one goes only when picked), `npm` (the package
cache), `pip` (the cache), `yarn` (Classic's global cache; Berry's is left out,
since Plug'n'Play projects run from it), `maven` (the local repository, at the
cost `rebuild`; always held, so it goes only when picked) and `go` (the module
cache after 30 days with no change, the build cache after a week, emptied with
`go clean`). While the tool runs, every candidate of `pnpm`, `uv`, `gradle`
(any Gradle build or daemon), `npm` (npm or npx), `pip` (pip, pip3 or
`python -m pip`), `yarn`, `maven` (mvn, `./mvnw`, mvnd or any process naming
`maven`, such as IntelliJ's Maven server) and `go` (go, gopls, or any process
naming `go`, such as an editor open on `main.go`) is refused as `in-use`, at
the survey and again before each delete, so a long-running `pnpm dev` keeps
the pnpm store from being pruned. Idle time is the newest modification time
inside a folder, and reading a file doesn't change it: a Hugging Face model or
a Gradle wrapper distribution in daily use counts as idle from its download,
which is why they are held. So does a Maven repository whose artifacts are all
downloaded, and it may hold what only a local `mvn install` gives back, which
is why it is held too.

Each finds a store from the environment variables its tool reads, from
`uv.toml`, or by asking the tool (`npm config get cache`, `pnpm store path`,
`pnpm config get cache-dir`, `uv cache dir`, `go env`) when it is on PATH, else
at the default folder. Some settings the tools read are not followed: Maven's
`localRepository` in `settings.xml` and `-Dmaven.repo.local` in `MAVEN_OPTS`,
pip's `cache-dir` in `pip.conf`, Yarn's `cache-folder` in `.yarnrc`, and
`-Dgradle.user.home` in `GRADLE_OPTS`. A store moved by one of those, or by
any setting not listed here, is not found, and the folder it left behind, if
any, is what gets cleaned. Name such a store in the config with
`plugins.<name>.vars`:

```json
{ "plugins": { "maven": { "vars": { "LOCAL_REPOSITORY": "/data/m2/repository" } } } }
```

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
      env: { GOTOOLCHAIN: local } # optional entries for the command's environment
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
your own setting, with nothing in the config, whether a folder uses the
built-in or a variable with an `env: XDG_CACHE_HOME` source: a folder under
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

A code plugin published as a package runs when the config names it:
`"plugins": { "podman": { "package": "@acme/host-cleaner-podman" } }`. Only a
package the config names is loaded, by its npm name and never from a path: from
the `node_modules` folders host-cleaner itself is installed in, then the global
npm prefix, found as npm finds it for `npm i -g`: `npm_config_prefix`, else
`prefix` in your `~/.npmrc` (or `npm_config_userconfig`), the global npmrc, or
the npmrc shipped with the `npm` on your PATH (Homebrew's sets it), else npm's
default (`%APPDATA%\npm` on Windows, else `PREFIX`, else the one Node is
installed under). A project `.npmrc`, an `npm` in a `node_modules` folder and a
relative prefix are not used. Its default
export must be a `definePlugin` value whose `name` is the config key and whose
`api` is this host-cleaner's `PLUGIN_API`. A name a built-in has is refused
(exit 2). A package replaces a shipped descriptor of its name, and a
descriptor of its name in the config directory or `--descriptor` is a file
that can't be used.
Packages run after the built-ins and before the descriptors, by name. No
package is imported until the config's other entries and the descriptors have
been checked. When one fails to load (not installed, its import throws, a wrong
export, name or api), `status` and `plan` warn and go on without it, and
`clean` exits 2 unless you pass `--skip-plugin <name>`, since its objections
would be missing too. A package the config disables, or that `--skip-plugin`
names, is not loaded, except by `host-cleaner config`, which loads every
package the config names to print and check its settings, and names each with
its version and folder.

### Files and config

host-cleaner keeps its files in three folders, from `@osdlc/tiered-dirs`'
`standalone('host-cleaner')` tier under the `xdg` convention, so macOS uses the
same folders as Linux:

| What | Path, macOS and Linux | Moved by |
| --- | --- | --- |
| Config | `~/.config/host-cleaner/config.json` | `HOST_CLEANER_CONFIG_DIR`, or `XDG_CONFIG_HOME` |
| Receipts | `~/.local/state/host-cleaner/receipts/` | `HOST_CLEANER_STATE_DIR`, or `XDG_STATE_HOME` |
| Log | `~/.local/state/host-cleaner/host-cleaner.log` | `HOST_CLEANER_LOGS_DIR`, or `XDG_STATE_HOME` |

Each variable names the base folder, and host-cleaner adds `host-cleaner/` to
it: with `HOST_CLEANER_CONFIG_DIR=/srv/cfg` the config is
`/srv/cfg/host-cleaner/config.json`. A `HOST_CLEANER_*` folder must be an
absolute path, and `~` in it is not expanded, so a relative or `~` path is
refused with exit 2. A relative `XDG_*` value is ignored, as the XDG spec says.
`HOST_CLEANER_ROOT` moves all three folders, which is useful for tests.
`HOST_CLEANER_CONVENTION=native` puts them back in macOS's own folders under
`~/Library`. Spaces around the value are ignored and an empty value counts as
unset; any value other than `native` or `xdg` is refused with exit 2. When
`HOME` (`USERPROFILE` on Windows) is unset, empty or relative, the OS account's
home is used. `~` in an `ignore` entry is that same home, so the entry covers
the folder it names. `~` in a target is too when `HOME` is unset; when it is
set but empty or relative, a target that starts with `~` is refused with
exit 1, so `~/dev` never sweeps the account's real `~/dev`. With no home
directory to place the folders in, and no variable that places them, a
`clean` that deletes and every command that reads the default config exit 1;
`status`, `plan`,
`config` and `clean --dry-run` given `--config` still run, unless a target or
ignore entry starts with `~`, which is then refused with exit 1.
Windows has no `xdg` folders and keeps its own: the config is
`%APPDATA%\host-cleaner\config.json`.

Versions up to 0.3 kept the macOS config in
`~/Library/Application Support/host-cleaner/`; it now lives in
`~/.config/host-cleaner/`, and host-cleaner does not read the old file; while
it exists, every command that reads the default config warns on stderr
(`status --format json` lists it in `warnings`). While it is the only one,
with nothing at the new path and no `--config`, `clean` refuses with exit 2
(`clean --dry-run` only warns), since its `ignore` list would not apply: move
the file to the new path. Their
receipts and log stay where they were written, in
`~/Library/Application Support/host-cleaner/receipts/` and
`~/Library/Logs/host-cleaner/`; new ones go to `~/.local/state/host-cleaner/`.

The config file holds the targets and each plugin's settings:

```json
{ "targets": ["~/dev"], "plugins": { "cargo": { "idleHours": 48 }, "node": { "enabled": false } } }
```

`plugins.<name>` holds that plugin's settings. A name that no plugin has, such
as a descriptor given only by `--descriptor`, stops `clean` (with `--plan` and `--dry-run` too) with exit 2 before anything is deleted, since a
misspelt name would leave that plugin on its defaults; `status`, `plan` and
`config` warn (the warning is kept in `status --format json`) and go on. A plan
records that no plugin had the name when it was made, and the receipt of a run
from it keeps that. Each plugin's settings are a strict schema, checked when the config
loads: a misspelt key or a wrong type is refused (exit 2), naming the plugin and
the key.

| Setting | Plugins | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | every plugin | `true` | `false` leaves the plugin out of every run. `--plugin <name>` runs it anyway. |
| `package` | a plugin loaded from a package | none | The npm package it is loaded from. |
| `idleHours` | `cargo`, `node`, `ollama`, `jetbrains`, `toolchains`, every descriptor | the top-level `idleHours`, else `24` | Hours an artifact must have sat unused before it is a candidate; `0` or more, fractions included (`0.5` is half an hour), and `0` takes every artifact. |
| `vars.<NAME>` | descriptors that declare `vars` | none | A folder (`~/…` or absolute) for one of the descriptor's variables. It wins over every source and may sit outside home. A name the descriptor does not declare is an error. It wins over the sources of the variables built from it too: `GOPATH` (go) moves the module cache even with go on PATH. |
| `keepVolumes` | `docker` | `[]` | Volume names never proposed, even when no container uses them. |

Two settings sit at the top of the config and apply to every plugin:

```json
{ "targets": ["~/dev"], "ignore": ["~/dev/dashboard"], "idleHours": 0 }
```

- `ignore` lists paths nothing may be deleted in or below (`~` is home, and on
  Windows `~\` as well as `~/`; a path is matched by its real path too). `--ignore <dir>` adds to it and can repeat.
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

`host-cleaner config` prints the config file it looked for (and says when it
is missing, so the defaults apply), then every plugin's effective settings:
the value, and whether the file set it or it is the default. Under a descriptor's `idleHours`
it prints each entry with its own value and the threshold the run applies to it
(to a prune entry only when its program is not on PATH and the folder is
removed whole).
`--format json` prints the values, with `file` and `fileExists`, and those
thresholds under `partIdleHours`.

### Which plugins run here

`host-cleaner plugins` lists every plugin: where it came from, each plugin by its
own origin (`built-in` when host-cleaner ships it, even when a program passes it
to `main` or a copy of it; `package` for one a config entry's `package` loads;
for a descriptor `shipped`, `user` for the config directory or `flag` for
`--descriptor`; and `given` for a plugin the program
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
disables, why is a warning, and the text says that status, plan or clean with
`--plugin <name>` stops on that error, as it does for a disabled built-in
plugin whose name such a descriptor has. One named as a built-in plugin is a
warning alone, as a config entry that names no plugin is, as in `config`.
`plugins` loads the packages the config does not disable; a package that did
not load has a row too, not detected, with why as the reason, and a disabled
one is listed as `disabled`.

Under a descriptor with variables, one line per variable its folders and locks
use on this OS, built in or declared: its value and the source that gave it,
then each source tried before it and why it gave none. A command that timed out
says so, and the source after it that gave the value is the one named. A
variable no source gave a value has no value; its folders are left out, and the
note says so. The variables come with `detect`'s answer, so a descriptor whose
`detect` threw, timed out, was skipped or was superseded shows none, as does
one whose `onPath` conditions alone leave it undetected. Each line
keeps to itself: a line break in a value is printed as a space. `--format json`
prints the same, one object per plugin: `{ name, source, replaces, enabled,
detected, reason, roots, rootsFailed, selfRoots, note, vars }`, under `plugins`
beside `targets`, `ignore` and `warnings`.

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
