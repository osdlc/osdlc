# @osdlc/system-model

## 0.7.0

### Minor Changes

- b835ae4: The make runner reads one makefile per directory in GNU make's order (`GNUmakefile`, then `makefile`, then `Makefile`), so a directory holding several now reports a different file's targets. It also lists every target on a multi-target line (`build test:`). A go-task include outside the root is no longer attributed to the root `Taskfile.yml`. A just parameter whose default is an expression is optional and puts no literal in the argv. A crate a workspace excludes gets its own cargo aliases, including when an inner workspace excludes it but an outer one lists it. A workspace root whose TOML does not parse still covers its crates.
  A Gemfile `platforms … do` or `if` block no longer closes the `group` around it. yaml-lite reads an escaped backslash before a closing quote correctly. deno and turbo configs accept a BOM and trailing commas, and an unparseable deno config is a warning diagnostic.
  A cache entry with no usable report is a miss. `humanMs` and `humanAge` pick the unit from the rounded value (`1.0s`, not `1000ms`). The pinned install `command` is shell-quoted, and its default probe runs a bare name only from an absolute PATH entry. `validateToolDef` checks each `ecosystem.manifests`, `languages` and `tools` entry.
  Repository reads check that a path's real location stays inside the repository with `@osdlc/path-guard`'s `realPathInside`, a new dependency, in place of a hand-written prefix check. On Windows the comparison now follows `node:path`'s rules, so a real path that differs from the root only in letter case counts as inside it.
  New exports, each a `readonly` tuple usable with `z.enum`: `ALL_PARAMETERS_UNKNOWN_REASONS`, `ALL_ROLE_NAMES`, `ALL_PROVIDER_KINDS`, `ALL_PROBE_COSTS`, and the experimental `ALL_CACHE_STATES` and `ALL_STALE_REASONS` from `./schema`; `ALL_MATCH_MODES` from `./match`; the experimental `ALL_GROUP_IDS` from `./groups`. The matching types (`ParametersUnknownReason`, `RoleName`, `ProviderKind`, `ProbeCost`, `StaleReason`, `RunnerCacheState['state']`, `Mode`, `GroupId`) are derived from them and the JSON Schemas list their values, so the three cannot drift apart.
- ebd5328: A runner's probe timeout now bounds the whole probe, not only each subprocess. A runner still running at its timeout is stopped: the processes it started are killed with their trees, and it reports `status: 'error'` with the diagnostic `timed out after 10 s`. The other runners go on, and a timed-out runner is not stored in the cache. A runner whose subprocesses run one after another may now be cut off sooner than before; raise its limit with `CollectOptions.timeouts`. The clock starts once the shared file listing is ready, so a slow listing does not count against a runner.
  
  New `CollectOptions.probeTimeoutMs` sets the probe timeout of every runner `timeouts` does not name. New `CollectOptions.maxProbeTimeoutMs` caps every runner's timeout after both; it only lowers a limit, for a value from a less trusted source such as a project file. `Infinity` in either option means no limit, and a finite value above 2^31-1 ms is treated as 2^31-1. A timeout that is not above 0 fails that runner with a diagnostic. A runner's context `signal` is now its own: it aborts when the caller's does, or at the timeout.
  
  New, experimental: `project.runners.collectAndStore(profile, dir)` returns `{ catalog, stored }` as soon as every runner has answered, then hashes the files and writes the store in the background. `stored` settles when the writes end; await it before the process exits. `collectAndCache` is `collectAndStore` with the writes awaited. Writes to one entry from two probes in a row land in order.

### Patch Changes

- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
  - @osdlc/command-seam@0.13.0
  - @osdlc/etag-write@0.3.0

## 0.6.0

### Minor Changes

- f6993bf: `CollectOptions` has two new callbacks, so a host can show each runner as it answers instead of waiting for the whole catalog. `onRunners` is called once, before any probe, with the runners the collect will report. `onReport` is called once per runner as its report is ready, withheld runners included. `collect` and `collectAndCache` still return the whole catalog.

### Patch Changes

- Updated dependencies [f013f38]
  - @osdlc/command-seam@0.12.1

## 0.5.0

### Minor Changes

- d243a32: `CollectOptions.onProbe` is called once for each runner that was probed, with how long the probe took in ms. A host can report the time of a fresh probe without reading the cache again. It is not called for a runner withheld because execution is not allowed.
- 9616994: **Breaking:** a few results change. What to do:
  
  - Every subprocess a runner or a `describe` function starts now has a timeout, third-party runners included. A runner that declares no `probe.timeoutMs` is killed after `DEFAULT_PROBE_TIMEOUT_MS` (60 s); before, most calls had none. Declare `RunnerRole.probe.timeoutMs`, or pass `CollectOptions.timeouts`, for a tool that needs longer.
  - Each subprocess runs with command-seam's `killTree: true`, so a timeout or abort kills the processes it started too. On POSIX the child leads its own process group and no longer gets the terminal's Ctrl-C. A CLI host must abort the `signal` it passes on `SIGINT`, or call `installGroupSignalForwarding` from `@osdlc/command-seam` once at start-up.
  - `Runners` has a new required member, `invocation(task, args)`. A class that implements `Runners`, or a mock of it, must add it; forward it to `invocationOf` or return `{ argv: runners.invoke(task, args), env: {} }`.
  - A cached report probed with execution allowed is no longer served to a run without it. `readCached` reports the runner `stale` with reason `exec` and leaves its report out. Probe again to get one.
  - A read refuses an absolute path and a path with `..`, and follows every symlink on the path, not only the last one. A file behind a symlinked directory that points out of the root reads as `null`. `ctx.exists` follows the same rule, so it is `false` for such a path.
  - With execution off, `ctx.runner(binary)` hands a parse runner or a `detect` function a runner that runs nothing: every call resolves as a spawn failure (`neverExited: true`, `reason: 'spawn'`). The contract already said not to spawn without `ctx.allowExec`; a runner that did must check it first.
  - `Catalog` requires `kind: 'catalog'` and `schemaVersion`, and so does its JSON Schema. Code that builds a `Catalog` by hand, such as a test fixture, must set both; use `CATALOG_SCHEMA_VERSION` from `./detect`.
  
  - yarn scripts now run as `yarn run <name>` (`yarn --cwd <dir> run <name>` below the root), so a script named `version` or `pack` no longer runs yarn's own command. Update any test or stored argv that expects `yarn <name>`.
  - `ProviderContext.readText` (and `readJson`) now return `null` for a symlink that leaves the root, anything that is not a regular file, and a file over `MAX_READ_BYTES` (4 MiB). Detection reports such a manifest in `profile.malformed`.
  - `runners.invoke` throws when a runner's `invoke` changes `argv[0]`. A runner rule must keep the binary.
  - `StaleReason` has three new values, `exec`, `version` and `tool`. Handle them where you switch over it.
  - `ParametersUnknownReason` has a new value, `editor-variable`: a VS Code task whose command uses a variable only the editor fills in (`${file}`). Its `argv` keeps the variable as written, so do not run such a task as is.
  - `builtins` has ten more tools (listed below), so a repository can show more reports, and `profile.ecosystems` can include `dotnet`. `BuiltinToolId` gains their ids.
  - The cache format is now version 5. Entries written by earlier versions are not read; the next run probes again.
  - `RunnerRole.brand` is deprecated. Move it to `ToolDef.brand`. The old field still works.
  
  New:
  
  - `Task.parametersUnknown` says why `parameters` is empty when the runner could not read them: `exec-withheld`, `tool-missing`, `tool-failed` or `not-read`. just and rake set it on tasks scanned from source, and GitHub Actions on every dispatch task.
  - `Task.dependsOn` holds the ids of tasks that run first, and `Task.dependsOnUnresolved` the names that match no task. turbo, moon, go-task, just and rake fill them.
  - `Param` gains `binding` (`positional`, `flag`, `switch`, `assign` or `env`), `doc` and `choices`, all experimental. `runners.invoke` takes values by parameter name as well as a list, and `runners.invocation` returns `{ argv, env }`. Positional, `flag` and `switch` words go through the runner's rule, after any `--` it adds (`npm run build -- --env prod`); `assign` words go before it. A positional value bound by name that starts with `-` is refused when the tool would read it as its own option; `RunnerRole.optionsEndAtTask` (set by just) opts out. `bindParams` in `./params` does the same checks for a browser and returns `{ args, positional, assign, env }`.
  - `RunnerRole.probe` declares a timeout and a cost hint (`cheap` or `slow`). Every subprocess a runner, a `describe` function or discovery's git starts gets the caller's `signal` and a timeout; `DEFAULT_PROBE_TIMEOUT_MS` is the default, and `CollectOptions.timeouts` overrides it per runner. moon, just, mise and sbt now have one. `RunnerCacheState.cost` carries the hint.
  - A stored probe records whether exec was allowed, this package's version, the tool binary it found with its size and mtime, and every binary the runner looked up through `ctx.which`. A mismatch reads as stale. A file over `MAX_READ_BYTES` stales an entry by its size and mtime.
  - The directory walk stops at `MAX_WALK_FILES` files and `MAX_WALK_DEPTH` levels, and `ProjectProfile.diagnostics` says when it did.
  - rake arguments escape `,`, `]` and `\`. rake's scanner reads prerequisites and the `task name:` form. A task whose path is longer than 4096 characters is left out.
  - Every file scanner takes time linear in the file, so a hostile repository cannot stall detection in-process: just, rake, the Gemfile, go-task, the YAML scanner, pre-commit, VS Code tasks and workspace globs with many `*` or `**`.
  - `ToolDef` gains `homepage`, `description` and `brand`. Every built-in has a homepage and a description, and most have a brand.
  - `Catalog` carries `kind: 'catalog'` and `schemaVersion` (`CATALOG_SCHEMA_VERSION`). The new `./schema` entry has JSON Schemas for `Catalog`, `RunnerReport`, `Task`, `Param` and `ToolInfo`. `toolInfo(tool)` in `./detect` returns a tool's JSON-safe part.
  - The new browser-safe `./groups` entry holds the group table (`GROUPS`, `groupOf`, `catalogGroups`, `SYNTHESIZED_RUNNERS`).
  - `validateToolDef(value)` lists the problems that keep a value from being a `ToolDef`, including a brand `color` that is not `#rrggbb`.
  - The directory walk visits entries in name order, so a capped walk keeps the same files on every machine.
  - Ten new runners, each reading files only:
    - `poe` (Poe the Poet): `[tool.poe.tasks]` or a `poe_tasks.*` file, with `args` as parameters (a `boolean` arg is a `switch`) and `deps` as `dependsOn`, run through `uv run` or `poetry run` when one manages the package.
    - `pdm`: `[tool.pdm.scripts]`, without the `pre_*` and `post_*` hooks `pdm run` runs itself.
    - `hatch`: each environment's scripts from pyproject.toml or hatch.toml, as `hatch run <env>:<script>`.
    - `cargo-aliases`: the `[alias]` table of `.cargo/config.toml` files, merged from a crate up to the root, `xtask` included.
    - `nx`: declared targets from `project.json` and `package.json` `nx.targets`, with `dependsOn` and `nx.json` `targetDefaults`, all read as JSONC. Inferred targets are not listed.
    - `vscode-tasks`: `.vscode/tasks.json` shell, process and npm tasks, with `dependsOn`, `isBackground`, top-level `options` and the current platform's override. In a `sh -c` line, `${workspaceFolder}` is quoted for where it sits: a word outside quotes, escaped inside `"…"`, spliced between `'…'`.
    - `devbox`: `devbox.json` `shell.scripts`.
    - `procfile`: each `Procfile` and `Procfile.dev` entry as a declared service, run through overmind, foreman or honcho, else `sh -c`.
    - `runners.invoke` on a `sh -c` task (VS Code, Procfile) passes arguments as `"$@"`. It refuses them when the line has more than one command, ends in a comment, or uses syntax that bash and dash read differently, such as `&>log`. The only `&` redirections it accepts are `2>&1`-style copies.
    - `cmake-presets`: configure, build and test presets, with `include` files and each preset's `configurePreset` as `dependsOn`. A preset whose `condition`, its own or inherited, is false here is not listed, and an `inherits` walk is capped.
    - `dotnet`: build, restore and publish for each solution and project file, `run` for a program and `test` for a test project, in a new `./dotnet` entry with the dotnet ecosystem.

### Patch Changes

- d243a32: A mise task declared in a file on another drive than the project (Windows) now keeps its absolute `source`, as one above the project root does. Before, its `source` was a path that named the wrong file. A file in the project whose name starts with two dots, such as `..tasks/build`, now reads as inside the project.
- d243a32: Detection and file listing find the files a pattern can match by basename or depth, instead of testing every pattern against every listed file. On a repository of 30,000 files, detection took about 1.2 s and now takes about 0.4 s, and reading the cache takes about half as long. What matches is unchanged.
  
  `runners.readCached` now stops when `options.signal` aborts, before it hashes the next runner's files, and rejects with the abort reason. Before, it read on to the end, or, if a listing was aborted, answered with every runner a miss.
- d243a32: On Windows, a VS Code task with `options.cwd` is no longer skipped as outside the repository. The check compared paths with `/` only, so a Windows root never matched and every task with a working folder (top-level `options.cwd` included) was dropped. It now resolves both paths with the platform's rules.
- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
  - @osdlc/command-seam@0.12.0

## 0.4.2

### Patch Changes

- Updated dependencies [0cf31de]
  - @osdlc/command-seam@0.11.0

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
