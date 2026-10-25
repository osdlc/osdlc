# @osdlc/system-model

## 0.4.1

### Patch Changes

- 910deca: Two fixes for running detection inside a repository that is not yet trusted.
  
  - File discovery now runs git with `core.fsmonitor` off. `git ls-files --others` runs the command `core.fsmonitor` names, and discovery runs before a repository is trusted, so a `.git/config` that came with a directory (an archive, a shared folder) could run a command on any `detect`, `collect` or cache read.
  - The default `makeRunner` and `which` now find a binary on absolute `PATH` entries only. Every spawn runs in the repository, where a relative `PATH` entry (`bin`, `.`, `node_modules/.bin`) or, on Windows, the current folder would find a `git` the repository ships. Such a binary is no longer found or run. A tool found only through a relative `PATH` entry, such as a runner in a project-local `node_modules/.bin` put on `PATH` as `node_modules/.bin`, now reads as not installed; put an absolute entry on `PATH`, or pass your own `makeRunner` and `which`.
- Updated dependencies [910deca]
  - @osdlc/command-seam@0.10.0

## 0.4.0

### Minor Changes

- 3f0455e: **Breaking:** `Detected.facts` is now `ToolFact[]` instead of `unknown[]`. Each entry is `{ dir, fact, evidence }`, so a fact records which directory it describes, even when that directory has no package of its own. To get the old value, use `facts.map((f) => f.fact)`.
  
  Fix the package manager chosen for a package that both a nested workspace root and an outer root list. If the nearest root has no lockfile, marker or pin, detection now checks each outer root that lists the package, nearest first. Before, it fell back to npm. A package that no workspace lists still does not take a lockfile from a parent directory.

## 0.3.0

### Minor Changes

- e5a7a98: First release from osdlc. The wire contract (the root entry, `./graph`, `./aspect`, `./client`, `./saved-view`) is unchanged from 0.2.0 and still imports no Node built-in and no dependency. Added: detection, tools, runners and actions in the new `./detect` entry and the plugin entries, which replace `@osdlc/detect-runners`.
  
  - **Tools and roles.** Each tool is described once as a `ToolDef` with the roles it plays: package manager, runner, tool manager, hook manager. Ecosystems (node, rust, python, go, ruby, jvm, php, swift, deno) are data, with their manifests, language rules and manager precedence. `createProject({ tools })`, from `./detect`, binds tools into a registry.
  - **Detection.** `detect(root)` reads a repository from one file listing and returns a profile of packages, each with its ecosystems, languages, parsed manifests and detected tools. Every claim carries the tiered `Evidence` from `./aspect`.
  - **Runners.** `runners.collect(profile)` lists the tasks of each detected runner, with installs, tool trust and git hooks as synthesized tasks; `runners.invoke` binds arguments per tool; `runners.readCached` and `runners.collectAndCache` cache the result in a directory the caller passes.
  - **Actions.** `packageManagers`, `install`, `frozenInstall`, `missingDeps`, `pinnedInstall`, `toolManagers`, `execPrefix`, `trust`, `hookManagers`, `armHooks` and `toolForCommand` answer what to run in a directory.
  - **Entries.** Thirty-two built-in tools ship as plugin entries (`./node`, `./rust`, `./python`, `./jvm`, `./php`, `./swift`, `./ruby`, `./go`, `./deno`, `./runners`, `./tools`) and together as `./builtins`; `./match`, `./params` and `./duration` import no Node built-in either.
  
  Running a repository's own tools stays off unless `allowExec` is set.

## 0.2.0

Released in the development repository only; never published to npm.

### Minor Changes

- **Saved views.** The `./saved-view` entry point and the `SavedViewStore`
  port that keeps named views of a system graph.
  ([#1576](https://github.com/sksizer/dev/pull/1576))

## 0.1.0

Released in the development repository only; never published to npm.

### Minor Changes

- **The system model as one contract.** `SystemGraph`, `SystemNode` and
  `SystemEdge` as they cross the wire (`./graph`), the `NodeKind`, `DepKind`,
  `SpecifierKind` and `Ecosystem` unions with their `ALL_*` rosters, the
  one-method `SystemGraphClient` port a host satisfies to serve the graph
  (`./client`), and the aspect types (`./aspect`). Types and API only, no
  runtime dependencies. ([#1565](https://github.com/sksizer/dev/pull/1565))
