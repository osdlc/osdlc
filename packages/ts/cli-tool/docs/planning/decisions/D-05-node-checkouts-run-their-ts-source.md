---
id: D-05
type: decision
state: accepted
created: 2026-11-05
---

# D-05: A node checkout runs its TypeScript source through Node's type stripping

## Decision

- `ToolSpec.runtime` is `'bun'` (the default) or `'node'`. It picks what runs
  a checkout selected by the env, cwd or link layer, in `execSelection` and
  in the bash launcher from `renderLauncher`, which also runs its own
  checkout's source under it. It is an enum, not a command prefix.
- Under node a checkout runs `node <entry>`, by the entry's path, with no
  flags. The entry is the checkout's source, the same file bun would run. A
  TypeScript entry (`.ts`, `.mts`, `.cts`) runs through Node's built-in type
  stripping, which is on by default from Node 22.18 in the 22 line and 23.6
  in the 23 line. Devlink does not build a checkout, and it does not pass
  `--experimental-strip-types`.
- A `.js` entry is run as it is. A tool that needs a built file sets `entry`
  to it and builds it itself; devlink does not know or check that it is
  current.
- `validateSpec` refuses `runtime: 'node'` with a `.tsx` or `.jsx` entry.
- `dev link` and `dev use` check the entry before they write anything, and
  refuse with a `DevlinkError` (exit 1) when:
  - the entry is not a file (under either runtime);
  - under node, a TypeScript entry's real path has a `node_modules` folder;
  - under node, the `node` that would run a TypeScript entry is missing,
    does not answer `--version`, or is older than 22.18 (or 23.0 to 23.5).
  The `node` is the one `execSelection` would use: the running Node, whose
  version is read from `process.versions`, else the first `node` on an
  absolute `PATH` entry, which is asked `node --version` once.
- The launch does not check the Node version.
- The bash launcher's `local` layer with a `builtEntry`, under node, never
  counts a checkout whose path has a `node_modules` folder as a dev checkout:
  it runs the built entry.
- A project's copy is not affected by `runtime`: it runs under the runtime
  its bin's `#!` line names, as before.
- A checkout whose dependencies are missing is told to run its package
  manager's install under node, and `bun install` under bun.

## Why

- Devlink exists to run the code you are editing. A built entry goes stale
  silently: edit, forget to build, and the old code runs with no sign of it.
  That is the failure devlink is least able to afford, and the bash
  launcher's `builtEntry` already avoids it by running a dev checkout's
  source. Type stripping makes the source runnable under node with no step
  between the edit and the run, as bun does.
- In the 22 line, 22.18 is the first release where stripping needs no flag
  and prints no warning, so the run is a plain `node <entry>`. Passing
  `--experimental-strip-types` would reach back to 22.6, but a flag that is a
  no-op today may be refused by a later release, and the warning it prints on
  older lines would be on every run. Node 22 is already this package's
  floor, and 22.18 is an update within that line.
- This repository's TypeScript already fits what Node strips: `.ts`
  extensions in relative imports (`allowImportingTsExtensions`),
  `verbatimModuleSyntax`, so a type-only import says `import type`, and no
  `enum` or `namespace`. A tool whose code needs more (path aliases, JSX, decorators
  with metadata) keeps `runtime: 'bun'`, or points `entry` at a built file
  and owns the build.
- An enum and not a command prefix: a prefix would push the bun safety
  flags (`--no-env-file`, an empty `--config`), the absolute-`PATH` lookup,
  the "running bun reuses itself" rule and the shell quoting of a rendered
  launcher onto every tool, and the bash launcher could not check it.
- Node needs no flags of its own: it reads no `.env` and no config file from
  the cwd unless told to, so nothing in a repository the user stands in
  changes what runs.
- The check is at `dev link` because that is when someone chose the
  checkout and is there to read why it cannot run. Checking again at every
  launch would cost a `node --version` spawn under bun (and in the bash
  launcher), on every run, to catch a node downgraded since. That node
  still fails clearly on its own, with `Unknown file extension ".ts"`.
- The `node_modules` refusal is Node's own rule
  (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). Linking a checkout that
  sits in one would always fail at launch, so it is refused when linked.
  The launcher's own checkout never goes through `dev link`, and `node` on
  PATH says nothing about development, while `npm i -g` nests the package's
  dependencies in its own `node_modules`. So under node the launcher reads
  the path: one under `node_modules` is an install.
- The project layer reads the bin's `#!` line because a published bin
  already names its runtime. A spec's runtime describes the tool's source,
  which an installed copy does not run.

## Consequences

- A spec without `runtime` renders a byte-identical bash launcher, so
  committed launchers do not drift.
- `Selected.runtime` is set for checkouts too, so `dev status --json` shows
  `runtime` for every selection, not only for a project copy.
- `dev link` and `dev use` now refuse a checkout whose `entry` is missing,
  under bun as well. Before, such a link was written and failed at launch.
- `ToolSpec.runtime` has no Rust twin and no conformance family.
