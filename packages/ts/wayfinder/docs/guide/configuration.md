---
title: Configuration
sidebar:
  order: 4
description: The layered settings files and the config command.
---

Settings you would otherwise retype on every run live in a file: which
runners to skip, their order, whether execution is allowed, how files are
found, which extra tool modules to load, and how `way` opens.

## Layers

Lowest precedence first:

| Layer    | Where                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------- |
| defaults | built in                                                                                                |
| user     | `config.json` in wayfinder's config directory. See [Paths](#paths)                                 |
| project  | `wayfinder.config.json` at the project root                                                               |
| flags    | the command line                                                                                        |

The project root is the one `way` resolved upward from the directory, not
the working directory.

`WAYFINDER_CONFIG=/path/to/file` replaces the user file's location and nothing
else. It does not move the project file and does not add a layer. A leading
`~` is expanded. A relative path is ignored with a warning, and the default
path is read instead: you usually run `way` from the project root, so a
relative path would name a file in the repository. Naming a file that does not
exist is an error. Every command reads `WAYFINDER_CONFIG` the same way.

The user file can turn execution on and load tools, so it must never be a
file inside a repository.

`way config path` prints where each layer's file lives.

## Paths

wayfinder keeps three directories outside your repositories. XDG paths are
used on every platform, macOS included.

| Directory | Holds                    | Default                                              |
| --------- | ------------------------ | ---------------------------------------------------- |
| config    | the user config file     | `$XDG_CONFIG_HOME/wayfinder`, or `~/.config/wayfinder` |
| state     | the trust store          | `$XDG_STATE_HOME/wayfinder`, or `~/.local/state/wayfinder` |
| cache     | stored probe results     | `$XDG_CACHE_HOME/wayfinder`, or `~/.cache/wayfinder` |

`WAYFINDER_ROOT=/some/dir` moves all three under one directory:
`/some/dir/config/wayfinder`, `/some/dir/state/wayfinder` and
`/some/dir/cache/wayfinder`. `WAYFINDER_CONFIG_DIR`, `WAYFINDER_STATE_DIR` and
`WAYFINDER_CACHE_DIR` move one base each. These variables must hold absolute
paths; a relative one is an error.

A relative `XDG_*` value is ignored, as the XDG spec says. A leading `~` in an
`XDG_*` value is not expanded. A relative `HOME` counts as unset, and your
account's home is used.

`way clean` reports and removes these directories. See
[Trust and execution](trust.md#removing-what-is-stored).

## Merging

Objects merge key by key. Scalars and arrays replace:

```text
user    { runners: { disabled: ["cargo"], order: ["moon"] } }
project { runners: {                      order: ["just"] } }
result  { runners: { disabled: ["cargo"], order: ["just"] } }
```

An array answers "which ones", so a later layer replaces it rather than
appending to it. `--exclude` replaces `runners.disabled`, and
`--exclude-path` replaces `excludePaths`.

## The file

Every key is optional:

```jsonc
{
  // Added by "way config set". Editors use it to check the file.
  "$schema": "https://unpkg.com/@osdlc/wayfinder@0.10/schema/config.json",
  "runners": {
    // Runner ids to skip.
    "disabled": ["cargo"],
    // Preferred order. Runners not named here follow alphabetically.
    "order": ["moon", "just"],
    // Seconds one runner may take. null: each runner's own limit.
    "timeout": 20,
  },
  // The configured execution setting. --exec / --no-exec still win.
  "allowExec": false,
  // git | walk | auto: how files are found.
  "discovery": "auto",
  // Paths that are not project structure.
  "excludePaths": ["tests/fixtures/sample-repo"],
  // Modules that export extra tools. See Extending.
  "tools": ["./acme-tools.js"],
  // User file only. See Trust and execution.
  "trust": {
    "paths": ["/home/me/work/**"],
    "owners": ["my-org"],
    // Trust for one tool only, such as mise.
    "tools": { "mise": { "paths": ["/home/me/scratch/**"] } },
  },
  // User file only. tui | web: what a bare "way" opens.
  "open": "tui",
  // User file only. system | light | dark: the web view's colour scheme.
  "theme": "system",
  // User file only. project | all | off: which agent skills are listed.
  "skills": "project",
}
```

The settable keys are `runners.disabled`, `runners.order`, `runners.timeout`, `allowExec`,
`discovery`, `excludePaths`, `trust.paths`, `trust.owners`, `trust.tools`,
`tools`, `open`, `theme` and `skills`.

The package ships the file's JSON Schema at `schema/config.json`. `way config
set` writes `$schema` into a file that has none, and keeps the keys in the
schema's order. A write replaces the file in one step, so a crash never
leaves half a file.

### `runners.order`

`runners.order` orders the reports in `list`, `query`, the terminal UI and
the web view, within each row group. In the web view, a tab order you drag
in the browser takes precedence within its group. See
[The web view](web-view.mdx#reordering-tabs).

The terminal UI's settings screen and the web view save a new order to the
file that sets `runners.order` now, else to the user file, so the new order
always takes effect.

### `runners.timeout`

`runners.timeout` is how many seconds one runner may take to list its tasks,
its subprocesses included. A runner still running then is stopped: the
processes it started are killed, and it shows `timed out after 20 s` in place
of its rows, in the terminal UI, the web view and `list --json`. The other
runners are not affected, and a runner that timed out is not stored.

Unset or `null`, each runner has its own limit: 10 seconds for just and task,
30 for mise and rake, 120 for moon, 300 for gradle and sbt, and 60 for the
rest. Set it lower to stop a hung tool sooner, or higher for a slow build,
such as a cold gradle start. It takes 1 to 3600 seconds.

The user file sets the limit: `way config set --user runners.timeout 20`.
A project file, which the web view's settings page also writes, can only
lower it. Each runner takes the smaller of the project value and the limit
it would have without it: its own, or the user value. With no user value, a
project's `runners.timeout: 5` stops just at 5 seconds, and a project's
`runners.timeout: 600` leaves just at 10. A project value above the user
value, or a project `null` under a user value, is ignored with a warning, so
a repository cannot make a hung tool hold up loading longer.

### `excludePaths`

`runners.disabled` turns a runner off everywhere in the project.
`excludePaths` keeps every runner on and narrows where they look. Use it for
a tree that holds manifests nobody runs, such as a test-fixture repository or
a template.

```jsonc
{
  "excludePaths": [
    "tests/fixtures/sample-repo", // one tree, from the root
    "testdata", // any directory with this name
  ],
}
```

Two forms, and not glob syntax:

- **A bare name** matches any single path segment, at any depth.
- **A value with a slash** matches from the root, segment by segment, and
  takes the tree beneath it. `src/app` does not match `src/application`.

Changing this marks stored probes stale, with `reason: "excludes"`. See
[The cache](cache.md).

### `tools`

Paths to modules that export extra tools. A relative path resolves against
the file that names it. Entries in the user file always load. Entries in the
project file load only when the repository is trusted and execution is
allowed, because a tool module is code. See [Extending](extending.md).

### `allowExec`

wayfinder's built-in default for `allowExec` is `true`. Execution still needs
a trusted repository.

The project file can lower `allowExec` to `false`. It can never raise it to
`true`, because the file lives inside the repository being scanned. A project
file's `allowExec: true` is dropped before the layers merge, with a warning
that points at `way trust`. Only the user file and the command line can turn
execution on.

Highest precedence first:

1. `--exec` or `--no-exec`
2. `allowExec: false` in the project file, then `allowExec` in the user file
3. wayfinder's default, `true`

`way config list` and `way config get allowExec` report wayfinder's default,
labelled `(default)`.

This settles the configured value only. Execution also needs a trusted
repository, unless `--exec` is given. See [Trust and execution](trust.md).

### `trust.paths`, `trust.owners` and `trust.tools`

These pre-authorize a class of repositories without a per-repository grant.
`trust.tools.<tool>` takes the same `paths` and `owners`, and trusts that one
tool only. They count only in the user file. A project file's `trust` block is
dropped with a warning. See [Trust and execution](trust.md#the-policy).

### `open`, `theme` and `skills`

`open` is what a bare `way` opens: `tui` (the default) or `web`. `theme` is
the web view's colour scheme: `system` (the default), `light` or `dark`.
`skills` chooses the agent skills the Skills group lists: `project` (the
default), `all` (adds your own and your plugins' skills from the home folder)
or `off`. All three are personal, so they count only in the user file. A
project file's value is dropped with a warning, and `way config set
--project` refuses them.

## The `config` command

```text
way config list [--json]                        every setting, and the layer it came from
way config get <key>                            one setting's effective value, as JSON
way config set <key> <value> [--user|--project] write a setting (default --project)
way config unset <key> [--user|--project]       remove a setting (default --project)
way config path                                 where each layer's file lives
way config explain <key>                        how a setting got its value, layer by layer
way config --help                               this list
```

A value is read as JSON. When that fails it is taken as a plain string, so
`set discovery git` and `set runners.order '["moon","just"]'` both work.

`list` shows the layer that supplied each value. Settings go to stdout. File
locations and warnings go to stderr, so `--json` stays parseable.

`-C` works here too: `way config path -C /elsewhere` reports that directory's
files.

`explain` shows each layer from the default up, the value it sets, and which
one won. A layer that may not set the key, such as `open` in a project file,
is shown and marked ignored.

`set --project` refuses what a project file may not hold: `allowExec: true`,
`trust`, `open`, `theme` and `skills`. The web view refuses the same writes.
`trust`, `allowExec` and `tools` can only be changed from the command line:
the web view's server refuses those writes.

An unknown key in a file is a warning naming the file and the key, with the
closest known key when one is near, and the rest of the file still loads. A malformed file or a wrong-typed value is an
error naming the file and the problem.

## Exit codes

- **2**: the command cannot run as typed. An unknown subcommand, a wrong
  argument count, an unknown setting, or a value of the wrong type.
- **1**: a well-formed command failed against the state it found. A file
  that will not parse, or an `unset` on a key that is not set there.
