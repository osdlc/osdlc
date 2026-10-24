---
title: Configuration
sidebar:
  order: 4
description: The layered settings files and the config command.
---

Settings you would otherwise retype on every run live in a file: which
runners to skip, their order, whether execution is allowed, how files are
found, and which extra tool modules to load.

## Layers

Lowest precedence first:

| Layer    | Where                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------- |
| defaults | built in                                                                                                |
| user     | `$XDG_CONFIG_HOME/wayfinder/config.json`, or `~/.config/wayfinder/config.json` when that variable is unset |
| project  | `wayfinder.config.json` at the project root                                                               |
| flags    | the command line                                                                                        |

The project root is the one `way` resolved upward from the directory, not
the working directory. XDG paths are used on every platform, macOS included.

`WAYFINDER_CONFIG=/path/to/file` replaces the user file's location and nothing
else. It does not move the project file and does not add a layer. A leading
`~` is expanded, and a relative path resolves against the project root.
Naming a file that does not exist is an error.

`way config path` prints where each layer's file lives.

### Files from the waypost name

The tool was called waypost before its first release. The old names still
work when the new ones are absent:

- `WAYPOST_CONFIG` is read when `WAYFINDER_CONFIG` is unset.
- `<config home>/waypost/config.json` is read when
  `<config home>/wayfinder/config.json` does not exist.
- `waypost.config.json` is read when `wayfinder.config.json` does not exist
  at the project root.

`way config set` edits the file that is read, old name or new. Each fallback
prints a warning that names the new location. Rename the file to stop it.

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
  "runners": {
    // Runner ids to skip.
    "disabled": ["cargo"],
    // Preferred order. Runners not named here follow alphabetically.
    "order": ["moon", "just"],
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
  },
}
```

The settable keys are `runners.disabled`, `runners.order`, `allowExec`,
`discovery`, `excludePaths`, `trust.paths`, `trust.owners` and `tools`.

### `runners.order`

`runners.order` orders the reports in `--json`, `--list`, the terminal UI and
the web view, within each row group. In the web view, a tab order you drag
in the browser takes precedence within its group. See
[The web view](web-view.mdx#reordering-tabs).

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

wayfinder's built-in default for `allowExec` is `true`. That means willing in
principle. It is still gated on trust.

The project file can lower `allowExec` to `false`. It can never raise it to
`true`, because the file lives inside the repository being scanned. A project
file's `allowExec: true` is dropped before the layers merge, with a warning
that points at `way trust`. Only the user file and the command line can turn
execution on.

Highest precedence first:

1. `--exec` or `--no-exec`
2. `allowExec` in the user file, and `allowExec: false` in the project file
3. wayfinder's default, `true`

`way config list` and `way config get allowExec` report wayfinder's default,
labelled `(default)`.

This settles the configured value only. Execution also needs a trusted
repository, unless `--exec` is given. See [Trust and execution](trust.md).

### `trust.paths` and `trust.owners`

These pre-authorize a class of repositories without a per-repository grant.
They count only in the user file. A project file's `trust` block is dropped
with a warning. See [Trust and execution](trust.md#the-policy).

## The `config` command

```text
way config list [--json]                        every setting, and the layer it came from
way config get <key>                            one setting's effective value, as JSON
way config set <key> <value> [--user|--project] write a setting (default --project)
way config unset <key> [--user|--project]       remove a setting (default --project)
way config path                                 where each layer's file lives
way config --help                               this list
```

A value is read as JSON. When that fails it is taken as a plain string, so
`set discovery git` and `set runners.order '["moon","just"]'` both work.

`list` shows the layer that supplied each value. Settings go to stdout. File
locations and warnings go to stderr, so `--json` stays parseable.

`-C` works here too: `way config path -C /elsewhere` reports that directory's
files.

An unknown key in a file is a warning naming the file and the key, and the
rest of the file still loads. A malformed file or a wrong-typed value is an
error naming the file and the problem.

## Exit codes

- **2**: the command cannot run as typed. An unknown subcommand, a wrong
  argument count, an unknown setting, or a value of the wrong type.
- **1**: a well-formed command failed against the state it found. A file
  that will not parse, or an `unset` on a key that is not set there.
