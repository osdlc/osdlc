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
| `@osdlc/system-model/rust` | cargo and the rust ecosystem |
| `@osdlc/system-model/python` | uv, poetry, pip, the `python` runner, and the python ecosystem |
| `@osdlc/system-model/jvm` | gradle, maven, sbt, and the jvm ecosystem |
| `@osdlc/system-model/php` | composer and the php ecosystem |
| `@osdlc/system-model/swift` | SwiftPM and the swift ecosystem |
| `@osdlc/system-model/ruby` | bundler, rake, and the ruby ecosystem |
| `@osdlc/system-model/go` | go and the go ecosystem |
| `@osdlc/system-model/deno` | `deno task` and the deno ecosystem |
| `@osdlc/system-model/runners` | moon, just, make, turbo, go-task, docker compose, GitHub Actions |
| `@osdlc/system-model/tools` | mise, proto, direnv, lefthook, husky, pre-commit |
| `@osdlc/system-model/match` | fuzzy and exact matching of a query against tasks |
| `@osdlc/system-model/params` | `paramShape`, a task's parameters as one string |
| `@osdlc/system-model/duration` | `humanMs` and `humanAge` |
| `@osdlc/system-model/groups` | `GROUPS`, `groupOf`, `catalogGroups` and `SYNTHESIZED_RUNNERS`: which group a report falls in |

The core knows no tool. A plugin imports only the core, never another plugin.
The root entry, `./graph`, `./aspect`, `./client`, `./saved-view`, `./match`,
`./params`, `./duration` and `./groups` import no Node built-in and no
dependency, so a browser bundle can use them. A test walks each one's imports to check.

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

| Option | Default | Does |
|---|---|---|
| `discovery` | `'auto'` | `'git'`, `'walk'`, or git when the root is a repository |
| `excludePaths` | `[]` | extra names or root-relative prefixes to skip |
| `useBuiltinExcludes` | `true` | add `DEFAULT_EXCLUDES` (`node_modules`, `target`, `dist`, ...) |
| `allowExec` | `false` | let `describe` functions run the repository's tools |
| `makeRunner`, `which`, `signal` | `@osdlc/command-seam`, a PATH walk, none | injection for tests and cancellation |

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

Three synthesized runners turn role actions into tasks:

| Runner | Tasks |
|---|---|
| `package-manager` | `install` and `install-frozen` per package |
| `tool-manager` | `mise install`, `mise trust`, `direnv allow` |
| `hook-manager` | arming (`lefthook install`), and each configured hook (`lefthook run pre-push`) |

`project.runners.invoke(task, args)` returns the argv that runs a task with
arguments, bound the way its tool expects. Arguments go after `--` for npm
run, cargo run, moon, turbo, go-task and composer, and in `name[a,b]` form for
rake. Otherwise they are appended.

`project.runners.search(catalog, query)` ranks tasks against a query.

### Cache

`project.runners.collectAndCache(profile, dir)` collects and stores each
runner's result under a directory you choose.
`project.runners.readCached(profile, dir)` reads it back without running
anything, and says per runner whether the entry is `fresh`, `stale` or a
`miss`. An entry goes stale when a file it read or matched changes, when its
detection evidence changes, or, for an `exec` runner, after a maximum age.

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
`PackageJsonFact`, `PackageManagerChoice`, `PackageManagerRole`, `PinnedInstall`,
`PinnedInstallOptions`, `PinnedSource`, `PyprojectFact`, `RunnerCacheState`,
`SYNTHESIZED_RUNNERS`, `StaleReason`, `ToolAction`, `ToolFact`, `ToolManagerRole`

The experimental exports of `@osdlc/system-model/groups`:

`GROUPS`, `Group`, `GroupId`, `SYNTHESIZED_RUNNERS`, `catalogGroups`, `groupOf`

The experimental exports of `@osdlc/system-model/runners`:

`MoonProjectFact`

The `Project` members `packageManagers`, `install`, `frozenInstall`,
`missingDeps`, `pinnedInstall`, `toolManagers`, `execPrefix`, `trust`,
`hookManagers` and `armHooks`, the `Runners` members `readCached` and
`collectAndCache`, `RunnerContext.packageManagers` and `ToolDef.describe` are
experimental too. A test compares the lists above with the `@experimental`
tags in the source.

## Platforms and runtimes

Linux and macOS for the 0.x line. Windows support is planned before 1.0.

Node.js 22 or later, ESM only. Bun also runs it, through the compiled `dist/`.
The tests run on Vitest under Node.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
