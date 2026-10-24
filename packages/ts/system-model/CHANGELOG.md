# @osdlc/system-model

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
