# @osdlc/project

A model of what a repository contains: its packages, ecosystems and tools,
and the tasks its runners expose. Each tool is described once, with the roles
it plays. Detection reads files. Running a repository's own tools stays off
unless you allow it.

## Install

```sh
npm install @osdlc/project
```

`pnpm add @osdlc/project` and `yarn add @osdlc/project` work too.

ESM only. Node.js 22 or later. Bun also works.

## Quick start

```ts
import { createProject, tasks } from '@osdlc/project'
import { builtins } from '@osdlc/project/builtins'

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
`package.json` is tier 1; a lockfile is tier 3.

## Entries

| Entry | Exports |
|---|---|
| `@osdlc/project` | `createProject`, the task model, the profile and `ToolDef` types |
| `@osdlc/project/builtins` | `builtins`, every built-in tool in report order, and `BUILTIN_TOOL_IDS` |
| `@osdlc/project/node` | bun, pnpm, yarn, npm, `node-scripts`, and the node ecosystem |
| `@osdlc/project/rust` | cargo and the rust ecosystem |
| `@osdlc/project/python` | uv, poetry, pip, the `python` runner, and the python ecosystem |
| `@osdlc/project/jvm` | gradle, maven, sbt, and the jvm ecosystem |
| `@osdlc/project/php` | composer and the php ecosystem |
| `@osdlc/project/swift` | SwiftPM and the swift ecosystem |
| `@osdlc/project/ruby` | bundler, rake, and the ruby ecosystem |
| `@osdlc/project/go` | go and the go ecosystem |
| `@osdlc/project/deno` | `deno task` and the deno ecosystem |
| `@osdlc/project/runners` | moon, just, make, turbo, go-task, docker compose, GitHub Actions |
| `@osdlc/project/tools` | mise, proto, direnv, lefthook, husky, pre-commit |
| `@osdlc/project/match` | fuzzy and exact matching of a query against tasks |
| `@osdlc/project/params` | `paramShape`, a task's parameters as one string |
| `@osdlc/project/duration` | `humanMs` and `humanAge` |

The core knows no tool. A plugin imports only the core, never another plugin.
`./match`, `./params` and `./duration` import no Node built-in, so a browser
bundle can use them.

## Detection

`project.detect(root, options)` returns a `ProjectProfile`:

1. It lists the repository's files once: tracked and untracked-but-not-ignored
   files through git when the root is a repository, else a directory walk.
2. It matches every ecosystem manifest and every tool marker against the list.
3. The root and each directory with a manifest or a lockfile become packages.
   Any other marker belongs to the nearest package above it.
4. It parses each manifest once. A file that does not parse goes to
   `profile.malformed`; its package still exists.
5. Each tool's `detect` function adds evidence a file name cannot give, such
   as a `packageManager` field.
6. Each detected tool's `describe` function adds facts that may need the tool
   itself, such as moon's project roles. It runs a subprocess only when
   `allowExec` is set.
7. Each package gets its ecosystems and languages. The profile gets the union.

| Option | Default | Does |
|---|---|---|
| `discovery` | `'auto'` | `'git'`, `'walk'`, or git when the root is a repository |
| `excludePaths` | `[]` | extra names or root-relative prefixes to skip |
| `useBuiltinExcludes` | `true` | add `DEFAULT_EXCLUDES` (`node_modules`, `target`, `dist`, ...) |
| `allowExec` | `false` | let `describe` functions run the repository's tools |
| `makeRunner`, `which`, `signal` | the subprocess seam, a PATH walk, none | injection for tests and cancellation |

`project.findRoot(from)` walks up from a directory. A repository marker
(`.git`, or a marker a tool flags as a workspace root, such as moon's
`.moon/workspace.yml`) anywhere above wins over a package manifest, so a
monorepo member resolves to the monorepo.

### Patterns

Markers, manifests and `ctx.files()` share one pattern language, with
`.gitignore`'s anchoring:

| Pattern | Matches |
|---|---|
| `justfile` | a file of that name at any depth |
| `/mise.toml` | that path from the root only |
| `/.github/workflows/*.yml` | `*` matches within one segment |
| `/.husky/` | every file under that directory |

An anchored pattern with no `*` is also checked on disk, so a gitignored
`mise.local.toml` still counts.

## Runners

`project.runners.collect(profile, options)` runs the runner of each detected
tool and returns a `Catalog` of reports, in registry order. A tool that was not
detected produces no report.

A runner is `parse` or `exec`. A `parse` runner reads files. An `exec` runner,
such as moon or mise, has to run the repository's own configuration to list
its tasks, so it is withheld unless `allowExec` is true. A withheld runner
leaves a report with `skippedForExec: true` and a diagnostic; pass
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
arguments, bound the way its tool expects: after `--` for npm run, cargo run,
moon, turbo, go-task and composer; `name[a,b]` for rake; appended otherwise.

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

The package manager is chosen by walking from the package to the root and
stopping at the first package whose lockfile, marker or pin chooses one. Within
a package the most direct evidence wins, then the ecosystem's order (node:
bun, pnpm, yarn, npm). With nothing found, node falls back to `npm install`.

## Your own tools

A downstream tool is a `ToolDef`, the same shape as a built-in:

```ts
import { createProject, type ToolDef } from '@osdlc/project'
import { builtins } from '@osdlc/project/builtins'

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
reads the filesystem itself: it goes through `ctx`, so a test can hand it
canned output.

## Runtime

Runs under Node and Bun. It uses `node:fs`, `node:path`, `node:os` and
`node:crypto`. Every subprocess goes through `@osdlc/command-seam`. It
parses TOML with `smol-toml`.

## Stability

The package is 0.x, so any minor release may break the API. The task model,
`createProject`, detection, the runner contract and the plugin entries are
stable for the 0.x line. The role answers, the manifest facts, pinned installs
and the cache are experimental: their shapes are new, and they may change in
any release.

The experimental exports of `@osdlc/project`:

`CachedCatalog`, `CargoFact`, `DepFact`, `DepFactKind`, `DepFactSpecifierKind`,
`GemfileFact`, `GoModFact`, `HookDef`, `HookManagerRole`, `ManifestFacts`,
`PackageJsonFact`, `PackageManagerChoice`, `PackageManagerRole`, `PinnedInstall`,
`PinnedInstallOptions`, `PinnedSource`, `PyprojectFact`, `RunnerCacheState`,
`SYNTHESIZED_RUNNERS`, `StaleReason`, `ToolAction`, `ToolFact`, `ToolManagerRole`

The experimental exports of `@osdlc/project/runners`:

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
