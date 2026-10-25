# @osdlc/wayfinder

## 0.7.4

### Patch Changes

- Updated dependencies [1a44195]
  - @osdlc/typed-git@0.8.0

## 0.7.3

### Patch Changes

- Updated dependencies [0cf31de]
  - @osdlc/command-seam@0.11.0
  - @osdlc/cli-tool@0.8.1
  - @osdlc/system-model@0.4.2
  - @osdlc/typed-git@0.7.2

## 0.7.2

### Patch Changes

- 910deca: Security fixes. Upgrade if you run `way` in repositories you did not write.
  
  - The installed `way` no longer runs code from the directory you stand in. It used to hand off to any directory above the cwd that had a `src/cli.ts`, and ran it under Bun before trust was checked. It now hands off only to the checkout `WAY_HOME` names (an absolute path) or `way dev link` linked, and only when that checkout's `package.json` is named `@osdlc/wayfinder`. `bun` is found on absolute `PATH` entries only, so a `bun` the repository ships is never run. That checkout runs under Bun with `--no-env-file` and an empty config, so the `.env` and `bunfig.toml` of the directory you stand in can no longer set the environment or preload code. `WAY_CWD_DEV` no longer does anything. If you develop wayfinder, run `way dev link` in your checkout once. `way dev` still works but no longer shows in `way --help`.
  - A relative `WAYFINDER_CONFIG` (or `WAYPOST_CONFIG`) is now ignored with a warning, and the XDG path is read. Run from the repository root, a relative value named a file in the repository as your user config, which can turn execution on and load tools. Use an absolute path, or `~/`. A relative `XDG_CONFIG_HOME`, `XDG_STATE_HOME` or `XDG_CACHE_HOME` is ignored, as the XDG spec says, and a relative `HOME` counts as unset, so the user config, trust store, cache and dev link are never looked up under the cwd.
  - Detection and the `origin` owner lookup run the `git` found on absolute `PATH` entries only, so a `git` the repository ships is never run through a relative `PATH` entry or, on Windows, the current folder. The owner lookup also runs git with `core.fsmonitor` off. Clipboard and browser helpers, and the `on PATH` column of `way providers`, use the same lookup. A tool found only through a relative `PATH` entry (`bin`, `.`, `node_modules/.bin`) now reads as not installed; put an absolute entry for it on `PATH`.
  - The terminal UI, `--list`, `query`, the `trust`, `config`, `providers` and `dev` output, the `--serve` summary and every stderr line now replace control characters (C0, DEL and C1) and bidi controls (U+202A-202E, U+2066-2069) in repository text with U+FFFD. A task name or doc comment could carry escape sequences that write the clipboard or set the window title, or text that displays in a different order from what runs. Copied commands get the same text. `--json`, `way dev … --json` included, keeps every value exact and now writes DEL, C1 and bidi controls as `\u` escapes, so it is safe to print to a terminal. An error no command catches is printed the same way, with exit code 1.
  - A `trust.owners` entry now matches the host as well as the owner. A bare `my-org` means `github.com/my-org` and no longer trusts a clone from `gitlab.com/my-org` or `bitbucket.org/my-org`. To trust an owner on another host, write `gitlab.com/my-org`. Owner trust believes the repository's own `.git/config`, so it fits clones you made yourself; `trust.paths` is the stronger form. The docs now say so.
- Updated dependencies [910deca]
- Updated dependencies [910deca]
- Updated dependencies [910deca]
- Updated dependencies [910deca]
- Updated dependencies [910deca]
  - @osdlc/cli-tool@0.8.0
  - @osdlc/command-seam@0.10.0
  - @osdlc/config-layers@0.7.1
  - @osdlc/system-model@0.4.1
  - @osdlc/trust-repo@0.3.0
  - @osdlc/typed-git@0.7.1

## 0.7.1

### Patch Changes

- Updated dependencies [007d8ee]
- Updated dependencies [96b7144]
- Updated dependencies [3f0455e]
- Updated dependencies [b5aac07]
- Updated dependencies [41ef520]
  - @osdlc/cli-tool@0.7.0
  - @osdlc/config-layers@0.7.0
  - @osdlc/system-model@0.4.0
  - @osdlc/typed-git@0.7.0

## 0.7.0

### Minor Changes

- e5a7a98: First release from osdlc, as `@osdlc/wayfinder`. The package was renamed from `@osdlc/waypost` before its first npm release. The command is still `way`. `way` browses and runs every task in a repository from one list, in a terminal UI, a live web view, `way query`, `--list` and `--json`. It is rebuilt on `@osdlc/system-model` in place of `@osdlc/detect-runners`.
  
  - **Groups.** Besides runner tasks, every surface shows the commands system-model synthesizes from the detected package managers, tool managers and git-hook managers: Tasks, Dependencies, Tools and Git hooks, in that order. The tab bars show a break between groups, and `--json` adds a `groups` array of `{id, title, runners}`.
  - **`way providers`.** Lists every registered tool with its roles, runner kind, binary, whether the binary is on PATH, and whether it is built in or custom. `--json` gives the same rows.
  - **Your own tools.** `--config <module>` loads a module that exports `tools`, an array of `ToolDef`s, for one run. The `tools` config key loads modules every run: from the user file always, from the project file only when the repository is trusted and execution is allowed. `way guide extend` has an example.
  - **Arguments.** Typed arguments are bound by each tool's `invoke(task, args)`, so `npm run` gets them after `--`.
  - **Node.** Runs on Node 22.22+, 24.15+ and 26; Bun is no longer required. The web view is served through `node:http` and the page script is bundled at build time. Running a development checkout through `way dev` still needs Bun.
  - **Rename.** Every path and name moved from `waypost` to `wayfinder`. The old ones are still read when the new ones are absent, with a warning. When both an old and a new config file exist, the new one is read and a warning says the old one is ignored:
    - project file: `wayfinder.config.json`, falling back to `waypost.config.json`.
    - user file: `$XDG_CONFIG_HOME/wayfinder/config.json`, falling back to `$XDG_CONFIG_HOME/waypost/config.json`.
    - config variable: `WAYFINDER_CONFIG`, falling back to `WAYPOST_CONFIG`.
    - trust store: `$XDG_STATE_HOME/wayfinder/trusted/`. Grants in `$XDG_STATE_HOME/waypost/trusted/` still count. `way trust --untrust` and `way clean --trust` remove a grant from both.
    - cache: `$XDG_CACHE_HOME/wayfinder/`, with no fallback. The first run re-probes. `way clean --cache` also removes the old `$XDG_CACHE_HOME/waypost/`.
  - **Names.** The devlink state directories take their overrides from `WAY_ROOT`, `WAY_CONFIG_DIR` and the other `WAY_*` variables, in place of `FLEET_*`, and the vendor segment is `wayfinder` in place of `com.sizerllc`. A link made with `way dev link` before the rename must be made again, and `way dev install` writes a `wayfinder` shim beside `way`. Subcommand usage and hints name the `way` command.
  
  Behaviour changes for existing users: the stored probe cache uses system-model's layout, so the first run after upgrading re-probes. Runners that must be executed (moon, mise tasks, sbt) are reported only when the repository uses them. The config files and the trust store moved, with the fallbacks listed under Rename. The web view's settings screen refuses to write `tools`; use `way config set tools`.

### Patch Changes

- Updated dependencies [e5a7a98]
  - @osdlc/system-model@0.3.0

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.6.3] - 2026-10-06 (unpublished)

#### Fixed

- The devlink directories are spelled out in the package.

### [0.6.2] - 2026-09-18 (unpublished)

#### Added

- A user-layer `trust` block, with `trust.paths` and `trust.owners`, trusts a class of repositories
  without a per-repository marker. A project file cannot set it.
- `way trust --show` and `--json` report which layer decided (`by`) and the matching rule (`rule`).

### [0.6.1] - 2026-09-14 (unpublished)

#### Fixed

- Fixes in the command-line front end.

### [0.6.0] - 2026-09-14 (unpublished)

#### Changed

- Breaking: exit codes follow one rule. `2` means the command cannot run as typed, `1` means a
  well-formed command failed. Scripts that checked other codes must update.

### [0.5.0] - 2026-09-13 (unpublished)

#### Changed

- Breaking: flags are declared once and both help tiers come from that list. An unknown flag is now
  a usage error instead of being ignored.

### [0.4.4] - 2026-09-13 (unpublished)

#### Fixed

- The CLI runs on the shared `@osdlc/cli-tool` package. No change in behaviour.

### [0.4.3] - 2026-09-11 (unpublished)

#### Added

- `way dev`: run the installed `way` from a development checkout, with `install`, `link`,
  `history`, `use` and `status`.

### [0.4.2] - 2026-09-06 (unpublished)

#### Changed

- `--help` prints the short form. `--help --all` prints every flag.

### [0.4.1] - 2026-09-05 (unpublished)

#### Added

- `way trust --json` and `way clean --json` print one JSON document.

### [0.4.0] - 2026-09-05 (unpublished)

#### Removed

- Breaking: the `waypost` command. The package installs one command, `way`.

### [0.3.10] - 2026-09-04 (unpublished)

#### Added

- `way query <terms>` searches tasks from the shell and exits 1 when nothing matched.

### [0.3.9] - 2026-09-03 (unpublished)

#### Fixed

- Ten defects across the terminal UI, the web view and the settings screen. A flag given on the
  command line now survives a settings save.

### [0.3.8] - 2026-09-02 (unpublished)

#### Fixed

- Muted text in the web view meets WCAG AA contrast.

### [0.3.7] - 2026-09-01 (unpublished)

#### Added

- The settings screen shows execution settings, and the runner order can be reset.

### [0.3.6] - 2026-09-01 (unpublished)

#### Fixed

- Web view styling.

### [0.3.5] - 2026-09-01 (unpublished)

#### Added

- The settings screen writes changes behind an explicit Save.

### [0.3.4] - 2026-09-01 (unpublished)

#### Added

- A read-only settings screen in the web view and the terminal UI.

### [0.3.3] - 2026-08-31 (unpublished)

#### Added

- A recipe that takes arguments asks for them, then runs.

### [0.3.2] - 2026-08-31 (unpublished)

#### Added

- `--exclude-path` leaves a path out of discovery.

### [0.3.1] - 2026-08-31 (unpublished)

#### Fixed

- The runner picker's checkbox column lines up.

### [0.3.0] - 2026-08-31 (unpublished)

#### Changed

- Breaking: the tool is named waypost. The command, the config file `waypost.config.json`, the
  `WAYPOST_CONFIG` variable and the state directories use the new name.

### [0.2.7] - 2026-08-31 (unpublished)

#### Fixed

- The withheld-runners notice has its own bar in the web view.

### [0.2.6] - 2026-08-31 (unpublished)

#### Fixed

- The web view says when runners were withheld.

### [0.2.5] - 2026-08-31 (unpublished)

#### Added

- A probe cache for slow runners. Both surfaces paint from the store, then refresh, and mark stale
  rows.

### [0.2.4] - 2026-08-31 (unpublished)

#### Added

- docker-compose and GitHub Actions runners.

### [0.2.3] - 2026-08-31 (unpublished)

#### Changed

- The runner picker sorts by selection.

### [0.2.2] - 2026-08-31 (unpublished)

#### Added

- rake, go-task and gradle are read by asking the tool, when execution is allowed.

### [0.2.1] - 2026-08-31 (unpublished)

#### Added

- Three more runners, and a `guide` command.

### [0.2.0] - 2026-08-30 (unpublished)

#### Changed

- Breaking: a repository must be trusted before runners that execute its configuration run.

### [0.1.2] - 2026-08-30 (unpublished)

#### Added

- The web view can run a task in the server's terminal, behind a token handshake.

### [0.1.1] - 2026-08-30 (unpublished)

#### Fixed

- The web view's script bundles the library from source.

### [0.1.0] - 2026-08-30 (unpublished)

#### Added

- A terminal UI and a live web view over every task in a repository.
