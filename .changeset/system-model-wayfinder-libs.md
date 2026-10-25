---
"@osdlc/system-model": minor
---

**Breaking:** a few results change. What to do:

- Every subprocess a runner or a `describe` function starts now has a timeout, third-party runners included. A runner that declares no `probe.timeoutMs` is killed after `DEFAULT_PROBE_TIMEOUT_MS` (60 s); before, most calls had none. Declare `RunnerRole.probe.timeoutMs`, or pass `CollectOptions.timeouts`, for a tool that needs longer.
- Each subprocess runs with command-seam's `killTree: true`, so a timeout or abort kills the processes it started too. On POSIX the child leads its own process group and no longer gets the terminal's Ctrl-C. A CLI host must abort the `signal` it passes on `SIGINT`, or call `installGroupSignalForwarding` from `@osdlc/command-seam` once at start-up.
- `Runners` has a new required member, `invocation(task, args)`. A class that implements `Runners`, or a mock of it, must add it; forward it to `invocationOf` or return `{ argv: runners.invoke(task, args), env: {} }`.
- A cached report probed with execution allowed is no longer served to a run without it. `readCached` reports the runner `stale` with reason `exec` and leaves its report out. Probe again to get one.
- A read refuses an absolute path and a path with `..`, and follows every symlink on the path, not only the last one. A file behind a symlinked directory that points out of the root reads as `null`.
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
- rake arguments escape `,`, `]` and `\`. rake's scanner reads prerequisites and the `task name:` form.
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
  - `vscode-tasks`: `.vscode/tasks.json` shell, process and npm tasks, with `dependsOn`, `isBackground`, top-level `options` and the current platform's override.
  - `devbox`: `devbox.json` `shell.scripts`.
  - `procfile`: each `Procfile` and `Procfile.dev` entry as a declared service, run through overmind, foreman or honcho, else `sh -c`.
  - `cmake-presets`: configure, build and test presets, with `include` files and each preset's `configurePreset` as `dependsOn`. A preset whose `condition` is false here is not listed, and an `inherits` walk is capped.
  - `dotnet`: build, restore and publish for each solution and project file, `run` for a program and `test` for a test project, in a new `./dotnet` entry with the dotnet ecosystem.
