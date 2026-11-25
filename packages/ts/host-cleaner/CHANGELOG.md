# @osdlc/host-cleaner

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
