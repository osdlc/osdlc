# @osdlc/workstation-cleaner

## 0.4.0

### Minor Changes

- 0852ed3: Add the config's `agentFolders`: folders where coding agents keep their own worktrees. The core refuses (`agent-worktree`) every candidate in or holding one, for every plugin, and the list adds to a built-in one that always applies: Cursor's `~/.cursor/worktrees` and the Codex app's `~/.codex/worktrees`. Cursor's agent worktrees are refused by the core, as `host-cleaner`, not by the `cursor` plugin.
- e102a33: `host-cleaner clean --archive` pushes unlanded work to an archive branch on the remote before deleting it, as `repo-cleaner clean --archive` does: one archive per repository a run, made before another plugin acts on the repository's candidates or on a candidate inside one of its worktrees. `--archive-exclude` leaves matching files out of a worktree's snapshot. `Ctx.run` gives `roots`, `prepare`, `delete` and `deleted` the candidates the run deletes. A `prepare` may return a sentence, which the receipt keeps in the step's `prepared`.
- 0953325: Add the `agent-history` plugin, which proposes Claude Code's history folders for projects whose folder no longer exists, held as `lost`. The kit gains `kit.alive(pid, startedAt?)`, which asks the process probe whether a process is still the one that started then.
- fb14ce2: Add the `cursor` plugin, which removes Cursor's storage for workspaces that no longer exist only when picked and `discard-user-data` is allowed, since that storage holds chat history, and refuses any `git` worktree in Cursor's agent worktrees (`~/.cursor/worktrees`) and any `git` worktree a busy process works in, since the `cursor-agent` CLI runs as `node`.
- 9453563: Add the `docker` plugin, which has Docker remove volumes no container uses (held, as lost data), dangling images no container uses, and its reclaimable build cache.
  
  A candidate may set `capped: true`: the re-check drops it as `changed` when its `bytes` are more than the plan showed.
- b3cb7c9: Add the `jetbrains` plugin, which cleans the caches and logs of JetBrains IDE versions no longer installed and the caches of projects that are gone. The re-check drops as `changed` a candidate its owner holds for review now and did not hold in the plan, such as a folder used in between.
- dfef233: Add the `ollama` plugin, which proposes models not pulled or changed for `idleHours`, refuses a loaded one, protests every other one `ollama-use-unknown` (ollama does not record when a model was last run) and removes them with `ollama rm`.
- 0144ad3: Add the `toolchains` plugin, which proposes rustup toolchains and nvm or Volta Node versions that no checkout in the targets asks for and that were not used in the last `idleHours`. It proposes nothing unless the targets were given in the config or on the command line. On a volume mounted `noatime`, and on macOS unless the volume is mounted `strictatime`, where last use can't be measured, it keeps every version and says so. A Node version holding global npm packages is held for review, since they go with it. A version with a process working in its folder is refused.
- b482595: Add the `vscode` plugin, which removes VS Code's storage for workspaces that no longer exist (holding for review, as `lost`, storage that keeps chat or agent history) and refuses to delete a worktree a VS Code window has open, or may. `kit.running` also returns each process as `{ pid, command }`.
- 87f1cd4: **Breaking:** the plugin contract for the first version. Every hook may return a promise and runs under a time limit, a candidate is a path or a ref, and every path candidate is held to its plugin's roots or the targets.
  
  Removed or changed, and what replaces each:
  
  - `survey`, `recheck`, `clean` and the command line's `main` return promises: `await` them. They take a `RunCtx`; `Ctx`, what a hook gets, adds `signal` and `targetsGiven`.
  - `PLUGIN_ORDER` and `orderPlugins` are gone: plugins run in the order given, and the shipped ones are `BUILT_IN_PLUGINS`, in run order.
  - `--adapter` is gone: use `--plugin`.
  - `Candidate` is `PathCandidate` (`path`) or `RefCandidate` (`ref`, optional `at`), so `path` may be unset. A git branch is a ref named by its branch with its repository as `at` (its path was `<repo>:<name>`, which `--spare` still takes), and an Orca record a ref to Orca's id with the gone directory as `at`.
  - A plugin without `roots` is held to the targets (it was not checked), so a path candidate outside them is refused `outside-roots`: declare `roots`.
  - Plans are at version 2. A plan of another version, or without a field this version needs (`targetsGiven`), is refused: sweep again.
  - `ArtifactOptions.command` is gone: `cargoPlugin` and `nodePlugin` take the kit's options (`runner`, `which`) instead. Artifact evidence no longer holds the newest modification time or the size.
  - `detect` may answer `{ active, note }` as well as a boolean.
  - `host-cleaner status`, `plan` and `clean` refuse to run as root; `config`, which only reads the settings, still answers.
  
  New:
  
  - Each plugin is one `definePlugin` value holding its settings schema (its own refinements kept) and factory.
  - Each hook's time limit aborts its own `ctx.signal`. A limit stops a hook that waits; one that works synchronously and answers past its limit is timed out then, and its answer dropped, except `delete`'s, which counts, since it has deleted by then. `cargo` and `node` let their limit fire between checkouts, and `git`, `cargo` and `node` give `discover` 10 minutes.
  - A path, whatever the plugin, must sit inside its owner's roots, a target, or a linked worktree of a repository a target is in or whose main checkout is inside a target (so with `~/dev` as the target, a worktree of a repository in `~/dev` is inside wherever it is). `git` declares a worktree whose folder is gone, or left without its `.git`, as a root `{ path, self: true }`, since no checkout is left to find its repository from, so its record can still be pruned. It is checked on real paths at the survey, right before `delete` and in `kit.remove`. A linked worktree whose folder has become a link holds nothing.
  - Paths are compared by `realpathSync.native`, so where the filesystem ignores case `~/documents` is `~/Documents`.
  - A root may be declared `{ path, self: true }`, so the store folder itself may be a candidate. The core leaves out with a warning a root that is `/`, is or holds the home folder, is a personal folder such as `~/Documents`, is or holds a target or a linked worktree, or is a checkout (and a self root that is a symlink), checked at the survey, right before `delete` and in `kit.remove`.
  - A candidate may say what deleting it costs (`costDescription`: `re-download`, `rebuild` or `lost`). `lost` is held and needs `--allow discard-user-data`, and `status` shows the cost.
  - Two candidates with the same id or the same real path are one, the first plugin's. A path candidate with others inside it requires them, so they go first, and one that does not run (refused, spared, held or not allowed) keeps the outer one too, which is then blocked with a reason naming that candidate and what would let it run (`--allow <code>`, `--pick <id>` when the plan is made, or that it is refused or spared) in the clean preview, the `clean -i` checklist and the receipt.
  - An objection a plan would refuse (an unknown level, a reason that is not a string) refuses its candidate instead, with a warning, so a plan always reads back.
  - `create` gets the plugin kit, the safety helpers `cargo` and `node` are now built on (`idle`, `size`, `running`, `onPath`, `candidate`, `run` and `remove`). The core binds it each run to the plugin's roots and the targets, so `kit.remove` takes only the path and an unbound kit removes nothing; a kit the plugin built itself is bound too. `clean` unbinds it when it is over, and given `delete`'s `ctx`, `kit.remove` holds to that call's bounds while another run binds the same plugin. `coveredBy`, `present`, `idleHoursSetting` and `idleHoursOr` are exported beside it.
  - Idle time counts in fractions of an hour (`idleHours: 0.5` is half an hour). A folder whose idle time cannot be measured within the time budget is proposed `unmeasured` and needs `--allow unmeasured`. A cargo `target/` is dated within one budget, whatever the number of its profiles.
  - `kit.running({ name })` matches the name against the words of each process's command line, so `pnpm` under `node` and the Gradle daemon under `java` are found, while host-cleaner's own process and the launchers above it that name it (the `npm exec` or `pnpm dlx` that started it) are left out. A process table that cannot be read stays unknown for the rest of the hook call.
  - git's `delete` refuses a worktree whose folder has become a symlink.
  - Right before `delete` the core asks git for the linked worktrees again, so a root that holds one made since the survey is refused then.
  - `clean` (the command, also with `--plan`) deletes exactly what its preview showed as `delete`: one shown as `skip` is not deleted when what blocked it clears before the delete. The library's `clean` takes `dropped`, the skips a preview showed, and its receipt lists them ahead of its own.
  - `@osdlc/host-cleaner/testing` gives a plugin's tests a fake context, fake programs for the kit, a temporary home and `contractSuite`, which checks a plugin against the contract, a `delete` given its own candidate moved outside behind a symlink included, and which every shipped plugin passes.
  - The survey keeps a `detect` note in `notes`; `status`, `plan` and `clean` print it as a warning naming the plugin, and `status` and `clean` carry them under `notes` in `--format json`. The `orca` plugin gives as its note why it runs without asking Orca (it is not running, or its status cannot be read).
  - Every hook's `ctx` carries `targetsGiven`, false when the command line fell back to the directory it runs in, kept in the plan.
  - The text output writes the home folder in ids as `~`, and `--pick` and `--spare` take that form, also when `HOME` goes through a symlink.
- 7126d08: Add `descriptorPlugin`, which turns a tier 1 descriptor into a plugin built on the plugin kit: its folders per OS, globs, prunes and wipes, `inUse`, `project`, `supersededBy` and `system`, with the home and personal-folder checks. The re-check drops as `changed` a candidate that is held now and was not in the plan. The kit gains `overBudget()`, and `kit.idle` ages a path that is a file by itself.
- 331b229: Load descriptors from the package, the config folder's `descriptors/` and `--descriptor <file>`, after the built-ins and in one namespace, where a user file replaces a shipped one of the same name and any other clash is a file that can't be used. `config` reports such a file and goes on; `status`, `plan` and `clean` stop on it (exit 2) unless the run leaves its name out. A config entry that names no plugin is a warning for `status`, `plan` and `config`, and stops `clean`. A plan records the `--descriptor` files behind the plugins it ran, and `clean --plan` stops unless each is given. In `detect`, `ctx.running` holds the plugins found active so far.
- 356aaba: Load a code plugin from the package `plugins.<name>.package` names, checking its name and plugin api, and refuse `clean` when one fails to load unless it is skipped.
- de95945: Add `host-cleaner plugins`, which lists every plugin with its source, whether it is detected and why not, and its roots.
- 3c74c7a: `host-cleaner plugins` shows each descriptor's variables, with the value, the source that gave it and why each source before it failed, and names where each descriptor came from. A `detect` answer may carry `vars`, which `inspect` returns on each `PluginState`, and `inspect` says in `rootsFailed` why a detected plugin with a `roots` hook has no roots. A disabled plugin's JSON `reason` is `plugins.<name>.enabled is false`. A descriptor that can't be used has a row in `plugins`, and `DescriptorProblem` says where its file was found in `source`.
- 84169d2: Add the `@osdlc/host-cleaner/plugin` entry for writing a plugin, with `z` and `CommandFailed` re-exported (the main entry exports all of it too), and a guide to writing, testing and publishing one; `create` no longer gets `only`, which the `git` plugin now takes as an option: `gitDefinitionWith({ sweep: { only } })`, exported from the main entry.
- 0b9503c: Add the descriptor format (`descriptor: 1`): a zod schema, a YAML or JSON reader that names the field path and line of each problem, and the JSON Schema shipped as `schemas/descriptor-1.json`.
- aaf8f03: Ship descriptors for eight stores on their default folders: pnpm, uv, Hugging Face Hub, Gradle, npm, pip, Yarn and Maven. Maven's local repository, Hugging Face models and Gradle wrapper distributions are held: they go only when picked.
  
  A `plugins.<name>.idleHours` the user sets now wins over a descriptor entry's own `idleHours`, and a top-level `idleHours` can only raise it; `config` prints each such entry's threshold. `@osdlc/host-cleaner/testing` adds `fakeProcesses` and `ageTree`.
- 57718f3: Find the shipped stores where their documented variables, config files and commands moved them, and ship a descriptor for Go's module and build caches. A variable's `command` source takes `env` entries, a variable set in the config also wins over the sources of the variables built from it, and an `env` source that reads an `XDG_*` folder the environment sets keeps the trust that folder has.
- 99d8145: `clean --plan` refuses a plan whose candidates belong to a plugin this install does not have, and so does the library's `recheck`, which throws the new `StalePlan` (pass it every known plugin name as its fourth argument, and `clean` as its `known` option). A config entry for an unknown plugin name still stops `clean` (with `--plan` and `--dry-run` too) with exit 2 before anything is deleted; `status`, `plan` and `config` now warn of it (also in `status --format json`'s `warnings`; a plan, and the receipt of a run from it, records that no plugin had the name when the plan was made) and go on, and `config` shows only the plugins a run would build.
- 08b9f75: Read descriptor variables: a `${VAR}` in a folder is worked out on each survey from the config, then the environment, a TOML, JSON or YAML file, a command or a fixed value, with `HOME` and the `XDG_*` folders built in.
- 733e5db: Use the `xdg` folders on macOS as on Linux, so on macOS the config is `~/.config/host-cleaner/config.json` and receipts and the log are under `~/.local/state/host-cleaner/` (Windows keeps its own folders). A config left in `~/Library/Application Support/host-cleaner/` is not read, and a run without `--config` warns about it on stderr; move it to `~/.config/host-cleaner/`. While it is the only config, `clean` without `--dry-run` refuses with exit 2, naming both paths, since its `ignore` list would not apply. Receipts and the log from versions up to 0.3 are not moved: they stay in `~/Library/Application Support/host-cleaner/receipts/` and `~/Library/Logs/host-cleaner/`. `host-cleaner config` prints the config file it looked for and whether it exists. Every command refuses a folder variable it cannot use, such as a non-empty `HOST_CLEANER_CONVENTION` other than `native` or `xdg` or a relative `HOST_CLEANER_CONFIG_DIR`, with exit 2. When `HOME` is unset, empty or relative the OS account's home is used, for the folders and for `~` in `ignore`; a target that starts with `~` takes it only when `HOME` is unset, and is refused with exit 1 when `HOME` is set but empty or relative, so it never sweeps the account's real folder; and `XDG_CONFIG_HOME` with `XDG_STATE_HOME` place the folders without one; with neither, a command that needs the folders exits 1, while `clean --dry-run` does not need them; a `~` in a target or ignore entry with no home is refused with exit 1, not read some other way. On Windows `~\` is expanded as `~/` is, so an ignore entry written `~\dev\keep` covers that folder. With `XDG_CONFIG_HOME` alone and no home, the commands that only read the config (`status`, `plan`, `plugins`, `config`, `clean --dry-run`) read it there. Under a test runner, or with `HOST_CLEANER_REQUIRE_OVERRIDE` set, tiered-dirs' test rules apply to the CLI's own folders when it runs on `process.env`; an env passed to `main()` is read as given.

### Patch Changes

- 216e064: Fixes from the review rounds of the host-cleaner pull requests:
  
  - A plugin's `scope` answer that is `/`, is or holds the home folder, is a personal folder, or is not an absolute path without `..` is left out with a warning. Before, it became a target, so any path candidate below it counted as inside the bounds.
  - The docker plugin looks at a dangling image once more right before `docker image rm`, and leaves it if it has been tagged since the plan (`image rm` would untag and remove an image with one tag).
  - The vscode plugin counts a workspace storage folder as holding chats when the old chat key is only in a `-wal` or `-journal` log beside its `state.vscdb`, not yet written back to the file.
  - A descriptor command argument or `env` value with a `..` segment, such as `{path}/../..` or `--dir=..`, is refused: it named the checked folder as D13 asks, but pointed the command above it.
  - agent-history no longer proposes the history of a gone path whose user folder is missing beside your home, such as another machine's `/home/<user>/...`.
  - A package plugin whose `exports` target lacks `./` or leaves the package fails to load with "exports no entry for import", as Node refuses it.
  - A package plugin whose import does not finish in 30 seconds fails to load instead of hanging the command.
  - A package plugin whose settings declare `package` is refused, since the loader keeps that key for the npm name.
  - An unusable `--descriptor` file named after a configured package stays a problem even when it sits in the shipped descriptors folder.
  - git: `inspect` after a survey no longer lists that survey's gone worktrees as git roots.
  - The warning for a bad `detect` answer reads `{ active, note?, vars? }`.
  - `kit.running` hides only ancestors that name host-cleaner as a word (a trailing `@version` ignored), so a process whose command line only holds the text, such as a folder named `host-cleaner-notes`, is seen.
  - docker: `volume rm` and `image rm` get the delete limit, not the kit's 30 s default.
  - ollama: an `OLLAMA_HOST` with a scheme other than http or https is named in detect's note, not reported as a server that does not answer.
  - toolchains: a discover stopped while asking rustup what is in use rejects with the hook's abort reason.
  - A descriptor glob or project marker longer than 4096 characters is refused before its braces are expanded (`descriptor-1.json` gains `maxLength`).
  - A descriptor folder that is a home folder under `/System/Volumes/Data`, `/home<n>` or `/data/home` is refused.
  - A descriptor program written with a drive (`C:x`), or as `.` or `..`, is refused as not a name on PATH.
  - A descriptor's detect "set one of" problems are listed beside a type error in the same object.
  - A combined rest whose matches all go while it is checked again is reported already gone, not failed.
  - A descriptor file source's read is stopped at its time limit.
  - A skipped variable source says the variable "comes from the config" rather than "is set in the config".
  - With XDG_CONFIG_HOME set and no home, `status`, `plan`, `plugins`, `config` and a dry-run `clean` read the config instead of refusing; a deleting `clean` still needs a home.
  - The "no home directory" message names USERPROFILE on Windows, and HOME or XDG_CONFIG_HOME with XDG_STATE_HOME elsewhere.
  - With no home, `clean -i` refuses before it shows the checklist.
  - Shell advice in messages (`--plugin`, `--skip-plugin`, `--descriptor`) quotes a name or path a shell would split.
  - `plugins` shows a failed `roots` once, on its row, not again as a warning.
  - A descriptor folder or variable written `~\` is read as under home only on Windows, as ignore entries are.
  - A descriptor trusts the environment's XDG_* folders only for the home it was created for, not for another `ctx.home`.
  - jetbrains is not detected for an empty or relative HOME, and reads XDG_* only when the home is HOME's own.
- 42e56fd: Document the Orca refusal and the folders on macOS and Linux in the README, and add a guide page on how host-cleaner works (`docs/guide/how-it-works.md`), with the nesting reasons, and backlog items for what the first version leaves out.
- Updated dependencies [0b3fbfa]
- Updated dependencies [0b3fbfa]
- Updated dependencies [3f34046]
- Updated dependencies [28799e2]
- Updated dependencies [8be1132]
- Updated dependencies [ac231ce]
  - @osdlc/cli-tool@0.22.0
  - @osdlc/config-layers@0.12.0
  - @osdlc/repo-cleaner@0.25.0

## 0.3.0

### Minor Changes

- f05fc4e: While Orca is installed but not running, or `orca status` fails or prints no JSON, the `orca` plugin refuses every worktree under its workspaces folder instead of leaving them to `git`.
- b4ab232: Remove profiles (`--profile` and the `profiles` config key) and the `claude-code` plugin for the first version.
- ca89b6e: Remove `schedule` and `clean --auto` for the first version. The `schedule`
  command (the launchd agent), `clean --auto` with its lock and reports, and the
  `unattended` candidate mark are gone; plain `clean` and its receipts stay. A
  candidate a plugin holds for review is now marked `held: true` (it was
  `unattended: false`). The design is kept in
  `docs/planning/backlog/B-0001-unattended-cleaning.md` so it can come back.

### Patch Changes

- Updated dependencies [ebdb5ad]
  - @osdlc/typed-git@0.22.0
  - @osdlc/repo-cleaner@0.24.1

## 0.2.0

### Minor Changes

- af704d6: `host-cleaner clean --auto` cleans the unattended subset (candidates their owner marked `unattended: true` that nothing refuses or protests) with no `--allow`, under a lock, only over targets named on the command line or in the config file, and writes a report and a receipt to the state directory. `host-cleaner schedule install|uninstall|status` manages a launchd user agent that runs it. The `git` plugin marks only a clean worktree unattended.
- 2feec64: The `claude-code` plugin: running Claude Code sessions as `session:<pid>` candidates with a `close-session` protest, never unattended. Closing one checks the pid's start time and command, sends SIGTERM and waits for the exit; it never sends SIGKILL.
- af448e0: A machine-wide `ignore` list in the config, and `--ignore <dir>` on `status`, `plan` and `clean`, keep every plugin's candidates out of the listed paths; a saved plan records the list and a re-check drops what falls inside it as `ignored`. A top-level `idleHours` is the default for the `cargo` and `node` plugins, and `0` is now accepted and takes every artifact.
- 853d9bf: A plugin can declare `roots` for cleaning outside any checkout. The core refuses (`outside-roots`) a candidate of such a plugin that is not strictly inside one of them by its real path, and checks again right before `delete`. `containedIn` is exported.
- 8849182: New `orca` plugin. When the Orca app is running, it notes each worktree Orca manages, refuses one with an agent at work, protests (`close-terminals`) one with open terminals and closes them before the `git` plugin removes it, then asks Orca to forget the record. A record whose directory is gone is its own `orca-record` candidate, and `plugins.orca.repos` (default true) sweeps the repositories `orca repo list` names. With `orca` missing or not running the plugin stays out of the run.
- f4c457b: Each plugin's entry in the config's `plugins` is now a validated schema (through `@osdlc/config-layers`): a misspelt key or a wrong type is refused when the config loads, naming the plugin and the key. `plugins.<name>.enabled: false` leaves a plugin out of a run (`--plugin <name>` still runs it). New `host-cleaner config` prints every plugin's effective settings, defaults included.
- b63f74c: `profiles` in the config holds named overrides of `targets`, `ignore`, `idleHours` and `plugins`, chosen with `--profile <name>` on `status`, `plan`, `clean` and `config`. A profile is deep-merged over the config (`ignore` only grows), checked when the config loads, and an unknown name is refused.

## 0.1.2

### Patch Changes

- Updated dependencies [3f84b08]
  - @osdlc/typed-git@0.21.0
  - @osdlc/repo-cleaner@0.23.2

## 0.1.1

### Patch Changes

- Updated dependencies [1ba6088]
  - @osdlc/typed-git@0.20.0
  - @osdlc/repo-cleaner@0.23.1

## 0.1.0

### Minor Changes

- 4e30735: The `cargo` and `node` plugins: idle Rust `target/` directories (and `incremental` directories where incremental builds are off) and `node_modules` in idle linked worktrees, with their size, refused while a build or other process works in the checkout or when the path leads outside it. Settings: `plugins.cargo.idleHours` and `plugins.node.idleHours`.
- 2241bd3: A new package: machine cleanup as plugins. A plugin proposes candidates and objects to other plugins' candidates; the core runs scope, discover, object, decide, re-check, prepare, delete and deleted in a fixed plugin order, with one flat plan and one receipt. What runs is chosen in repo-cleaner's words: the default, `select` (exactly these), `pick` (these as well) and `spare` (ids, paths, names or globs left alone). The `git` plugin is repo-cleaner's sweep and `removeCandidate`. The `host-cleaner` command works in repo-cleaner's phases and flags: `status`, `plan` and `clean` (the bare command explains them and exits 2), `--pick` adds, `--spare` takes away, `clean -i` chooses from a checklist, `--worktrees` and `--branches` narrow the git candidates and `status --all-rows` shows refused ones. Also `--plugin`, `--skip-plugin` (`--adapter` is an alias), config `plugins.<name>`, a receipt in the state directory and a log line per run.

### Patch Changes

- Updated dependencies [32263e3]
  - @osdlc/repo-cleaner@0.23.0
