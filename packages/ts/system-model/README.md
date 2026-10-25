# @osdlc/system-model

A repository's system model, in two halves.

- **The wire contract**: a project's structure in its wire format
  (`SystemGraph`, `SystemNode`, `SystemEdge`, aspects with tiered evidence),
  plus the ports a host implements to serve it. Types and small pure helpers,
  with no runtime dependencies. This is the root entry, `@osdlc/system-model`,
  and it is safe to import in browser code.
- **Detection and tools**: what a repository contains (its packages,
  ecosystems and tools) and the tasks its runners expose. Each tool is
  described once, with the roles it plays. Detection reads files. Running a
  repository's own tools stays off unless you allow it. This starts at
  `@osdlc/system-model/detect` and needs Node or Bun.

## Install

```sh
npm install @osdlc/system-model
```

`pnpm add @osdlc/system-model` and `yarn add @osdlc/system-model` work too.

ESM only. Node.js 22 or later. Bun also works.

## Quick start

```ts
import { createProject, tasks } from '@osdlc/system-model/detect'
import { builtins } from '@osdlc/system-model/builtins'

const project = createProject({ tools: builtins })

const profile = await project.detect(process.cwd())
console.log(profile.ecosystems, profile.languages, profile.tools)
// [ 'node', 'rust' ] [ 'typescript', 'rust' ] [ 'just', 'node-scripts', 'cargo', 'pnpm' ]

const catalog = await project.runners.collect(profile)
for (const task of tasks(catalog)) console.log(task.display)
// just build
// pnpm run --dir apps/web dev
// cargo test
// pnpm install --frozen-lockfile
```

## Why

Tools that work across repositories keep asking the same questions: which
package manager does this directory use, how do I install, what tasks can I
run, which hooks need arming. Each answer tends to grow its own table of file
names, and the tables drift apart. This package keeps one entry per tool and
answers every question from it.

## The wire contract

```ts
import type { SystemGraph, SystemGraphClient, SystemNode } from '@osdlc/system-model'
```

The Rust schema is the authority on this shape. This package states it once
for TypeScript, so the producers, the hosts and the viewer all use the same
types instead of keeping their own copies.

**`./graph`**: `SystemGraph`, `SystemNode`, `SystemEdge`, and the string
unions (`NodeKind`, `DepKind`, `SpecifierKind`, `Ecosystem`) with their
`ALL_*` rosters.

Field names are snake_case because that is the wire format. The enum-shaped
fields are typed `string` rather than as those unions, on purpose. A consumer
that meets a new node kind shows it instead of breaking. The unions are
exported for code that wants to narrow. `Ecosystem` here is the graph's
packaging ecosystem (`node` or `rust`). Detection's ecosystems are
`EcosystemDef`s, a wider set.

**`./aspect`**: `Aspect`, `Evidence`, `EvidenceKind` and `EVIDENCE_TIERS`.
Detection uses the same `Evidence` for every claim it makes.

**`./client`**: `SystemGraphClient`, the port. One method, because the
viewer needs one thing: the whole graph. Folding a container is an
interaction, not a query. So the aggregation runs on the client over one
payload, and there is no second call for "the graph, but collapsed".

**`./saved-view`**: `SavedView` and the `SavedViewStore` port that keeps
named views of a graph, with `slugify` and `SLUG_PATTERN`.

`ProjectFacets` and the optional `ProjectFacetsStore` port, in the root
entry only, carry what the build system knows about a project that a manifest
cannot say, joined to graph nodes by directory.

### Who is on each side

| | |
|---|---|
| **Authority on the shape** | `solutions/ontological/desktop/src-tauri/src/schema/system_graph.rs` in the development repository |
| **Producers** | the `manifest-graph` crate (via SDF's service) and `@osdlc/manifest-graph` (via `buildSystemGraph`) |
| **Hosts implementing the port** | SDF, over ontogen's generated transport; `product-system-graph`, over a Nitro route |
| **Consumer** | `@sdlc/exp-system-graph`, which knows only this contract |

Two hosts implement the port and share no code. Keep it that way: it is why
the same viewer works against a Rust service and against an in-process
TypeScript call without any change.

Changing the wire format means changing the Rust schema and this package
together.

### What is deliberately not here

The view model (`ViewSpec`, `select`, `encode`, `derive`, and the layouts)
lives in `@sdlc/exp-system-graph`'s `app/lib/`. It is not a contract between
components. It is one viewer's internals, and putting it here would make
every host depend on one viewer's choices.

## The model

| Noun | Meaning | Examples |
|---|---|---|
| Ecosystem | A language platform: its manifests, languages and tools | node, rust, python, go, ruby |
| Tool | One program, described once as a `ToolDef` | pnpm, cargo, mise, lefthook |
| Role | A job a tool does, with that job's data | package manager, runner, tool manager, hook manager |
| Package | The root, or a directory with a manifest or a lockfile | `.`, `apps/web` |
| Evidence | Why a claim was made | `{ kind, tier, source, found }` |

Evidence tiers run from the most direct to the least: `manifest` (1),
`dependency` (2), `files` (3), `content` (4). A `packageManager` field in
`package.json` is tier 1. A lockfile is tier 3.

## Entries

| Entry | Exports |
|---|---|
| `@osdlc/system-model` | the whole wire contract: everything in the four entries below, plus `ProjectFacets` and `ProjectFacetsStore` |
| `@osdlc/system-model/graph` | `SystemGraph`, `SystemNode`, `SystemEdge`, the kind unions and their `ALL_*` rosters |
| `@osdlc/system-model/aspect` | `Aspect`, `Evidence`, `EvidenceKind`, `EVIDENCE_TIERS`, `ALL_ASPECTS`, `hasAspect`, `strongestTier` |
| `@osdlc/system-model/client` | `SystemGraphClient` |
| `@osdlc/system-model/saved-view` | `SavedView`, `SavedViewStore`, `PositionOverride`, `slugify`, `SLUG_PATTERN` |
| `@osdlc/system-model/detect` | `createProject`, the task model, the profile and `ToolDef` types |
| `@osdlc/system-model/builtins` | `builtins`, every built-in tool in report order, and `BUILTIN_TOOL_IDS` |
| `@osdlc/system-model/node` | bun, pnpm, yarn, npm, `node-scripts`, and the node ecosystem |
| `@osdlc/system-model/rust` | cargo, cargo aliases, and the rust ecosystem |
| `@osdlc/system-model/python` | uv, poetry, pip, the `python` runner, Poe the Poet, PDM, Hatch, and the python ecosystem |
| `@osdlc/system-model/jvm` | gradle, maven, sbt, and the jvm ecosystem |
| `@osdlc/system-model/php` | composer and the php ecosystem |
| `@osdlc/system-model/swift` | SwiftPM and the swift ecosystem |
| `@osdlc/system-model/ruby` | bundler, rake, and the ruby ecosystem |
| `@osdlc/system-model/go` | go and the go ecosystem |
| `@osdlc/system-model/deno` | `deno task` and the deno ecosystem |
| `@osdlc/system-model/dotnet` | the dotnet CLI and the dotnet ecosystem |
| `@osdlc/system-model/runners` | moon, just, make, turbo, go-task, docker compose, GitHub Actions, Nx, VS Code tasks, Devbox, Procfile, CMake presets |
| `@osdlc/system-model/tools` | mise, proto, direnv, lefthook, husky, pre-commit |
| `@osdlc/system-model/match` | fuzzy and exact matching of a query against tasks |
| `@osdlc/system-model/params` | `paramShape`, a task's parameters as one string |
| `@osdlc/system-model/duration` | `humanMs` and `humanAge` |
| `@osdlc/system-model/schema` | JSON Schemas for `Catalog`, `RunnerReport`, `Task`, `Param` and `ToolInfo` |
| `@osdlc/system-model/groups` | `GROUPS`, `groupOf`, `catalogGroups` and `SYNTHESIZED_RUNNERS`: which group a report falls in |

The core knows no tool. A plugin imports only the core, never another plugin.
The root entry, `./graph`, `./aspect`, `./client`, `./saved-view`, `./match`,
`./params`, `./duration`, `./groups` and `./schema` import no Node built-in
and no dependency, so a browser bundle can use them. A test walks each one's imports to check.

## Detection

`project.detect(root, options)` returns a `ProjectProfile`:

1. It lists the repository's files once. When the root is a git repository,
   it uses git (tracked files plus untracked files that are not ignored).
   Otherwise it walks the directory.
2. It matches every ecosystem manifest and every tool marker against the list.
3. The root and each directory with a manifest or a lockfile become packages.
   Any other marker belongs to the nearest package above it.
4. It parses each manifest once. A file that does not parse goes to
   `profile.malformed`. Its package still exists.
5. Each tool's `detect` function adds evidence a file name cannot give, such
   as a `packageManager` field.
6. Each detected tool's `describe` function adds facts that may need the tool
   itself, such as moon's project roles. It runs a subprocess only when
   `allowExec` is set. A fact goes on the package of its directory, or the
   nearest one above. `Detected.facts` holds them as `ToolFact`s, each with
   the directory it is about and its evidence.
7. Each package gets its ecosystems and languages. The profile gets the union.

Reads are bounded, because a repository is untrusted input. A read skips a
path whose real location is outside the root (through a symlinked file or
parent directory, `..`, or an absolute path), anything that is not a regular
file (a device such as `/dev/zero`, a pipe), and a file larger than
`MAX_READ_BYTES` (4 MiB). A directory walk visits entries in name order, stops
at `MAX_WALK_FILES` files and does not enter a directory deeper than
`MAX_WALK_DEPTH`. When it stops early, `profile.diagnostics` says so. git
discovery has no cap: it lists what `git ls-files` lists.

| Option | Default | Does |
|---|---|---|
| `discovery` | `'auto'` | `'git'`, `'walk'`, or git when the root is a repository |
| `excludePaths` | `[]` | extra names or root-relative prefixes to skip |
| `useBuiltinExcludes` | `true` | add `DEFAULT_EXCLUDES` (`node_modules`, `target`, `dist`, ...) |
| `allowExec` | `false` | let `describe` functions run the repository's tools |
| `makeRunner`, `which`, `signal` | `@osdlc/command-seam`, a PATH walk, none | injection for tests and cancellation |

Every subprocess detection starts gets `signal`. A `describe` call gets its
runner's probe timeout, else `DEFAULT_PROBE_TIMEOUT_MS` (60 s), and each
discovery git call 30 s.

`project.findRoot(from)` walks up from a directory. A repository marker
anywhere above wins over a package manifest. A repository marker is `.git`,
or a marker a tool flags as a workspace root, such as moon's
`.moon/workspace.yml`. So a monorepo member resolves to the monorepo.

### Patterns

Markers, manifests and `ctx.files()` share one pattern language, with
`.gitignore`'s anchoring:

| Pattern | Matches |
|---|---|
| `justfile` | a file of that name at any depth |
| `/mise.toml` | that path from the root only |
| `/.github/workflows/*.yml` | `*` matches within one segment |
| `/.husky/` | every file under that directory |

Detection also checks an anchored pattern with no `*` on disk, so a
gitignored `mise.local.toml` still counts as a marker. `ctx.files()` returns
only the files discovery listed.

## Runners

`project.runners.collect(profile, options)` runs the runner of each detected
tool and returns a `Catalog` of reports, in registry order. A tool that was not
detected produces no report. Each call lists and reads the repository again,
with the discovery settings the profile records (`discovery`, `excludePaths`,
`useBuiltinExcludes`). Runners re-read the files they report on. So a
second collect sees later edits to a `package.json` script or a justfile
recipe, and a profile copied through JSON collects the same way. Which
packages and tools exist, and which package manager each package uses, come
from the profile. Detect again after adding or removing a manifest, lockfile
or marker.

A runner is `parse` or `exec`. A `parse` runner reads files. An `exec` runner,
such as moon or mise, has to run the repository's own configuration to list
its tasks, so it is withheld unless `allowExec` is true. A withheld runner
leaves a report with `skippedForExec: true` and a diagnostic. Pass
`execWithheldHint` to append your own sentence about how to allow it.

Every `Task` carries an executable `argv`, a `display` string, the `source`
file, `origin` (`declared` or `synthesized`) and where it `executes`. A task's
directory is in its `argv` (`just --justfile`, `pnpm run --dir`), so the
command works when pasted at the root.

A task's `parameters` list each `Param` with its `binding` (`positional`,
`flag`, `switch`, `assign` or `env`; absent means positional), and its `doc` and
`choices` where the runner gives them. An empty list does not always mean
"takes none". When the runner could not read them, `parametersUnknown` says
why:

| Value | Meaning |
|---|---|
| `exec-withheld` | only the tool lists them, and execution was not allowed |
| `tool-missing` | execution was allowed, but the tool is not on the PATH |
| `tool-failed` | the tool ran and gave no usable answer |
| `not-read` | the file declares them, and this runner does not read them |
| `editor-variable` | the command uses a variable only an editor fills in (`${file}`); `argv` keeps it as written and does not run as is |

`dependsOn` holds the ids of tasks in the same report that run first.
`dependsOnUnresolved` keeps the dependencies that name no task, as written:
a turbo `^build`, a moon target in a project the listing does not hold, a
task an included Taskfile declares.
turbo, moon, go-task, just, rake, poe (`deps`), nx, VS Code
tasks and CMake presets (a build or test preset's `configurePreset`) fill them.

The built-in runners, and where their tasks come from:

| Runner | Reads | Runs |
|---|---|---|
| `moon` | `moon query tasks` (exec) | `moon run <project>:<task>` |
| `mise` | `mise tasks --json` (exec) | `mise run <task>` |
| `just` | `just --dump`, else the justfile | `just <recipe>` |
| `node-scripts` | `package.json` `scripts` | the package's manager: `pnpm run <script>` |
| `make` | Makefile targets | `make <target>` |
| `cargo` | each `Cargo.toml` (synthesized) | `cargo test`, `cargo build`, ... |
| `cargo-aliases` | `[alias]` in `.cargo/config.toml` and `.cargo/config` | `cargo <alias>` |
| `sbt` | `sbt` (exec) | `sbt <task>` |
| `python` | `pyproject.toml` `[tool.*]` and scripts | `ruff check`, `uv run <script>` |
| `poe` | `[tool.poe.tasks]`, or `poe_tasks.toml`, `.yaml`, `.yml`, `.json` | `poe <task>`, through `uv run` or `poetry run` when one manages the package |
| `pdm` | `[tool.pdm.scripts]`, without its `pre_*` and `post_*` hooks | `pdm run <script>` |
| `hatch` | `[tool.hatch.envs.<env>.scripts]` and `hatch.toml` | `hatch run <env>:<script>` |
| `composer` | `composer.json` `scripts` | `composer run-script <name>` |
| `deno-tasks` | `deno.json` `tasks` | `deno task <name>` |
| `turbo` | `turbo.json` `tasks` | `turbo run <task>` |
| `nx` | `project.json` targets, `package.json` `nx.targets`, `nx.json` `targetDefaults`, all read as JSONC | `nx run <project>:<target>` |
| `maven` | each `pom.xml` (synthesized) | `mvn <phase>` |
| `gradle` | `gradle tasks --all`, else the build files | `gradle <task>` |
| `swiftpm` | each `Package.swift` (synthesized) | `swift build`, ... |
| `dotnet` | each `.sln`, `.slnx`, `.csproj`, `.fsproj`, `.vbproj` (synthesized; `run` for a program, `test` for a test project) | `dotnet build <file>`, `dotnet run --project <file>`, ... |
| `go-task` | `task --list-all --json`, else the Taskfile | `task <name>` |
| `rake` | `rake -AT`, else the Rakefile | `rake <task>` |
| `cmake-presets` | `CMakePresets.json`, `CMakeUserPresets.json` and their includes | `cmake --preset`, `cmake --build --preset`, `ctest --preset` |
| `vscode-tasks` | `.vscode/tasks.json` | the task's command; a shell line with shell syntax as `sh -c` |
| `devbox` | `devbox.json` `shell.scripts` | `devbox run <script>` |
| `procfile` | `Procfile`, `Procfile.dev` | the first of overmind, foreman and honcho on the PATH, else `sh -c` |
| `docker-compose` | compose file `services` | `docker compose up <service>` |
| `github-actions` | dispatchable workflows | `gh workflow run <file>` |

A runner that names its tool in the Reads column asks it only when execution
is allowed and the tool is on the PATH; moon, mise and sbt have no other way.
Every other runner reads files only, so it needs no trust. Known gaps:

- nx lists declared targets only. Targets its plugins infer need Nx's project
  graph, which runs the workspace's plugins and the Nx daemon.
- poe does not read `include` files.
- VS Code tasks of other types (`gulp`, an extension's) and tasks that only
  run their `dependsOn` are skipped with a diagnostic, as is the old `0.1.0`
  format. The current platform's override is applied. `${workspaceFolder}`
  expands to this machine's path, so a catalog names absolute paths.
- procfile picks its process manager at collect time. A cached result reads
  as stale (`tool`) once another manager is installed or removed, as for any
  binary a runner looks up through `ctx.which`. A Procfile process takes no
  arguments through a manager.
- CMake package and workflow presets are not read.

Each subprocess a runner starts gets the caller's `signal` and a timeout. A
runner declares its timeout and a cost hint (`cheap` or `slow`) in
`RunnerRole.probe`. A runner that declares none gets `DEFAULT_PROBE_TIMEOUT_MS`.
`CollectOptions.timeouts` replaces a runner's timeout by id, such as
`{ moon: 300_000 }`.

Each subprocess also runs with command-seam's `killTree: true`, so a timeout
or an abort kills the processes it started as well (moon, gradle and sbt
fork): the process group on POSIX, `taskkill /t` on Windows. On POSIX the
child then leads its own process group and no longer gets the terminal's
Ctrl-C. A CLI host should abort `signal` on `SIGINT`, or call
`installGroupSignalForwarding` from `@osdlc/command-seam` once at start-up.

A catalog carries `kind: 'catalog'` and `schemaVersion`
(`CATALOG_SCHEMA_VERSION`). `@osdlc/system-model/schema` has JSON Schemas for
`Catalog`, `RunnerReport`, `Task`, `Param` and `ToolInfo`.

Three synthesized runners turn role actions into tasks:

| Runner | Tasks |
|---|---|
| `package-manager` | `install` and `install-frozen` per package |
| `tool-manager` | `mise install`, `mise trust`, `direnv allow` |
| `hook-manager` | arming (`lefthook install`), and each configured hook (`lefthook run pre-push`) |

`project.runners.invoke(task, args)` returns the argv that runs a task with
arguments, bound the way its tool expects. Positional arguments go after `--`
for npm run, cargo run, dotnet run, moon, turbo, nx, go-task and composer, and
in `name[a,b]` form for rake, with `,`, `]` and `\` escaped. A `sh -c` task
(VS Code, Procfile) takes them as `"$@"`, so each stays one word, and refuses
them when the line has more than one command (`;`, `&&`, `|`) or ends in a `#`
comment. Otherwise they are appended. `invoke` throws for a Procfile process run through a
manager, which takes no arguments.
`args` is a list of positional arguments, or values by parameter name:

```ts
// A task with a positional `target` and a `flag` --env parameter
runners.invoke(npmBuild, { target: 'web', env: 'prod' })
// ['npm', 'run', 'build', '--', 'web', '--env', 'prod']
```

Values by name are bound by each parameter's `binding`. Positional values and
`flag` and `switch` words are the task's own arguments: they go through the
tool's rule, after any `--` it adds. `assign` arguments (`ENV=prod`) are read
by the tool itself, so they go straight after the task's own argv. Only poe
declares bindings today; other runners' parameters are positional. A
positional value bound by name that starts with `-` is refused when the tool
would read it as its own option (no `--` before it). just is exempt, because
it ends its options at the recipe name. A list of strings passes as given. `invoke` throws when a value does not fit the parameters,
and when a tool's rule would change `argv[0]`, the binary.
`project.runners.invocation(task, args)` returns `{ argv, env }`, for a
parameter bound to an environment variable. `bindParams` in
`@osdlc/system-model/params` does the same checks without the registry, so a
web view can check values before it sends them.

`@osdlc/system-model/groups` sorts reports into groups for display: `tasks`,
then `dependencies`, `tools` and `hooks`, one per synthesized runner.

`project.runners.search(catalog, query)` ranks tasks against a query.

### Cache

`project.runners.collectAndCache(profile, dir)` collects and stores each
runner's result under a directory you choose.
`project.runners.readCached(profile, dir)` reads it back without running
anything, and says per runner whether the entry is `fresh`, `stale` or a
`miss`. An entry goes stale when a file it read or matched changes, when its
detection evidence changes, or, for an `exec` runner, after a maximum age. It
also goes stale when it was probed with execution allowed and now it is not
(or the reverse), by another version of this package, or when the tool's
binary resolves to another file, such as after an upgrade. `reason` names
which. Each runner's `cost` gives the declared hint before anything is
measured; `slow` and `estimateMs` come from this repository's measurements.

## Roles

| Member | Answers |
|---|---|
| `packageManagers(profile, dir)` | the package manager per ecosystem of a package |
| `install(profile, dir)` | one install command per ecosystem |
| `frozenInstall(profile, dir)` | the installs that refuse to change a lockfile |
| `missingDeps(profile, dir)` | the installs whose dependency directory is missing |
| `pinnedInstall(profile, install, options)` | a frozen install through the executable that has the pinned version |
| `toolManagers(profile)`, `execPrefix(profile, binary)`, `trust(profile)` | mise, proto and direnv |
| `hookManagers(profile)`, `armHooks(profile)` | lefthook, husky and pre-commit |
| `toolForCommand(command)` | the tool a command's first word names (`bunx` is bun) |

The package manager is chosen at the package itself, then at each workspace
root that covers it, nearest first. The first package whose lockfile, marker
or pin chooses one wins. A root covers a package when it lists the package as
a member, or lists a nested root that covers it. So when `a/` lists `b/*` and
has no lockfile, and the root lists `a/b/*` and holds `bun.lock`, `a/b/x`
takes bun from the root.

Members come from `package.json#workspaces`, `pnpm-workspace.yaml`
`packages`, and cargo's `[workspace] members` minus `exclude`. A `!` glob
removes a member. A `pnpm-workspace.yaml` that lists no package leaves the
members unknown, and every package below it counts as a member. A nested
package outside every workspace does not take the root's lockfile. An
ecosystem with no `workspace` hook (python, go, ruby, ...) takes the nearest
package above.

Within a package the most direct evidence wins, then the ecosystem's order
(node: bun, pnpm, yarn, npm). With nothing found, node falls back to
`npm install`.

## Your own tools

A downstream tool is a `ToolDef`, the same shape as a built-in:

```ts
import { createProject, type ToolDef } from '@osdlc/system-model/detect'
import { builtins } from '@osdlc/system-model/builtins'

const bashScripts: ToolDef = {
  id: 'bash-scripts',
  binary: 'bash',
  markers: [{ files: '/scripts/', tier: 'files' }],
  roles: {
    runner: {
      kind: 'parse',
      async collect(ctx) {
        const files = await ctx.files('/scripts/*.sh')
        return { status: 'ok', tasks: files.map(toTask), diagnostics: [] }
      },
    },
  },
}

const project = createProject({ tools: [...builtins, bashScripts] })
```

Registering two tools with one id throws. A runner never spawns a process or
reads the filesystem itself. It goes through `ctx`, so a test can give it
canned output.

Give a tool a `homepage`, a one-sentence `description` and a `brand` (an icon
and a colour); every built-in has them. `RunnerRole.brand` still works, and is
deprecated in favour of `ToolDef.brand`. A runner's `invoke` must keep
`task.argv[0]`.

`validateToolDef(value)` lists the problems that keep a value from being a
`ToolDef`, without calling any of its functions, for a host that loads tools
from a module. `toolInfo(tool)` returns a tool's data without its functions,
safe to print as JSON.

## Runtime

Runs under Node and Bun. It uses `node:fs`, `node:path`, `node:os` and
`node:crypto`. Every subprocess goes through `@osdlc/command-seam`. It
parses TOML with `smol-toml`.

## Stability

The package is 0.x, so any minor release may break the API. The task model,
`createProject`, detection, the runner contract and the plugin entries are
stable for the 0.x line. The role answers, the manifest facts, pinned installs
and the cache are experimental. Their shapes are new, and they may change in
any release.

The experimental exports of `@osdlc/system-model/detect`:

`CachedCatalog`, `CargoFact`, `DepFact`, `DepFactKind`, `DepFactSpecifierKind`,
`GemfileFact`, `GoModFact`, `HookDef`, `HookManagerRole`, `ManifestFacts`,
`PackageJsonFact`, `PackageManagerChoice`, `PackageManagerRole`, `ParamBinding`,
`PinnedInstall`, `PinnedInstallOptions`, `PinnedSource`, `PyprojectFact`, `RunnerCacheState`,
`SYNTHESIZED_RUNNERS`, `StaleReason`, `ToolAction`, `ToolFact`, `ToolManagerRole`

The experimental exports of `@osdlc/system-model/groups`:

`GROUPS`, `Group`, `GroupId`, `SYNTHESIZED_RUNNERS`, `catalogGroups`, `groupOf`

The experimental exports of `@osdlc/system-model/runners`:

`MoonProjectFact`

The `Project` members `packageManagers`, `install`, `frozenInstall`,
`missingDeps`, `pinnedInstall`, `toolManagers`, `execPrefix`, `trust`,
`hookManagers` and `armHooks`, the `Runners` members `readCached` and
`collectAndCache`, `RunnerContext.packageManagers`, `ToolDef.describe` and the `Param` fields
`binding`, `doc` and `choices` are experimental too. A test compares the lists above with the `@experimental`
tags in the source.

## Platforms and runtimes

Linux and macOS for the 0.x line. Windows support is planned before 1.0.

Node.js 22 or later, ESM only. Bun also runs it, through the compiled `dist/`.
The tests run on Vitest under Node.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
