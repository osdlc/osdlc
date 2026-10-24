# @osdlc/waypost

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
