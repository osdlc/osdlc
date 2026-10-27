# tradecraft

A command-line tool for coding-agent skills. You write each skill once, as a
markdown note in a vault (a folder of notes). `tradecraft` publishes the notes
into the on-disk formats of Claude Code, Codex, Cursor and Pi, builds them into
plugin marketplaces, reports drift, and authors and reorganises the vault.

The work is done by [`tradecraft-core`](../tradecraft-core). This crate reads
the configuration, calls the core and prints the result.

## Install

```sh
cargo install tradecraft
```

This installs the `tradecraft` binary. Prebuilt binaries for macOS and Linux
(arm64 and x86_64) are on each `tradecraft/vX.Y.Z` release of
[osdlc/osdlc](https://github.com/osdlc/osdlc/releases), and these install
them:

```sh
cargo binstall tradecraft
brew install osdlc/tap/tradecraft
npm install --global @osdlc/tradecraft   # or: npx @osdlc/tradecraft --help
curl -fsSL https://github.com/osdlc/osdlc/releases/download/tradecraft/v<version>/install.sh | sh
```

`install.sh` checks the binary against the release's `SHA256SUMS` and installs
it to `~/.local/bin`, or to the directory given with `--to`. The crate also has a library half, which
the binary and its tests use:

```sh
cargo add tradecraft
```

## Quick start

Make a vault with one skill note:

```sh
mkdir -p my-vault/skills
cat > my-vault/skills/code-review.md <<'EOF'
---
description: Reviews a diff for correctness bugs.
---
Read the diff. Report each bug with the line and a fix.
EOF
```

List what the vault holds:

```console
$ tradecraft list --vault my-vault
skills/code-review.md  skill  code-review  -  every destination · Reviews a diff for correctness bugs.
1 skill
```

Publish the note into a Claude Code project:

```console
$ tradecraft publish skills/code-review.md --vault my-vault --to my-project --target claude-code --yes
publishing skills/code-review.md -> /path/to/my-project (claude-code)
.tradecraft/manifest.json  written
.claude/skills/code-review/SKILL.md  written · first-write
2 written
```

`--dry-run` shows the plan and writes nothing. `tradecraft --help` and
`tradecraft <verb> --help` list every verb and option.

## Verbs

| Verb | Does |
|---|---|
| `publish` | Publish notes to their destinations |
| `build` | Render the vault into its marketplace roots and swap them into place |
| `check` | Report the marketplace's drift against the vault. Writes nothing; exits 1 on drift |
| `list` | List every publishable note in the vault |
| `adopt` | Bring skills already on disk, or in a repository with `--from-git`, into the vault as notes |
| `status` | Report each unit's publish state at each configured destination |
| `bump` | Raise a plugin's `tc-version` by one semver level |
| `new` | Author a new marketplace, plugin or skill note |
| `rename` | Rename a component, plugin or marketplace, and rewrite every link to it |
| `move` | Move a component to another plugin or marketplace |
| `delete` | Move a component's note to the vault's trash |
| `convert` | Change a note's kind and move it into that kind's folder |
| `harness install <claude\|codex\|cursor>` | Register the built marketplace with a harness and install its plugins, through the harness's own `plugin` command |
| `harness update <claude\|codex\|cursor>` | Install what is missing, then update each plugin whose version changed |
| `harness uninstall <claude\|codex\|cursor>` | Remove the marketplace's plugins from a harness, and with `--marketplace` its registration too |
| `init` | Declared, and exits `not implemented` |
| `unpublish` | Declared, and exits `not implemented` |

`build` and `check` are one path in two modes. The `harness` verbs change
nothing when run a second time.

stdout carries the report and nothing else. Progress, tallies, prompts and
error messages go to stderr. `--json` prints the report as one JSON document.

## Options

Every verb accepts these after the verb name, for example
`tradecraft build --vault ~/notes`:

| Option | Does |
|---|---|
| `--vault <path>` | The vault root, overriding the configuration |
| `--config <path>` | Read this project file instead of the nearest one above the working directory |
| `--namespace <stem>` | The frontmatter namespace stem, the `tc` of `tc-kind` |
| `--json` | Print the report on stdout as one JSON document |
| `--quiet` | Drop progress and the tally from stderr |
| `--dry-run` | Show the plan; write nothing (verbs that write) |
| `--yes` | Accept the plan without a prompt (verbs that write) |

Each verb's own options:

| Verb | Its own options |
|---|---|
| `publish` | `[note...]`, `--to <root>` (repeatable), `--target <target>`, `--all`, `--overwrite <path>` (repeatable) |
| `build` / `check` | `--out <path>`, `--skills-root <path>`, `--marketplace <name>`, `--default-plugin <name>`, `--watch` (`build` only) |
| `list` | `--skills-root <path>` |
| `status` | `[note]`, `--check` |
| `adopt` | `[source...]`, `--from <location>` (repeatable), `--from-git <ref>` (repeatable), `--plugin <name>`, `--into <path>`, `--set-targets <target>` (repeatable), `--only <name>` (repeatable), `--overwrite <path>` (repeatable) |
| `harness install` / `harness update` | `--plugin <name>` (repeatable), `--scope <user\|project\|local>`, `--path <path>`, `--git-url <url>`, `--git-ref <ref>` |
| `harness uninstall` | the same, plus `--marketplace` |

`adopt` also accepts `--as <name>` and `--promote`. Both exit with
`not implemented`.

## Exit codes

| Code | Means |
|---|---|
| 0 | The run completed and every outcome was written or unchanged |
| 1 | The run completed and something was refused, or `check` found drift |
| 2 | A run-level blocker. Nothing was attempted |
| 3 | Usage error |
| 4 | No configuration, and none supplied |
| 130 | Interrupted |

## Configuration

Two files, both optional. A flag overrides the project file, which overrides
the machine file. `tradecraft` never writes either one.

- **The project file** is `tradecraft.yaml`. It is committed, and found by
  walking up from the working directory, or named with `--config`. It holds
  the vault path, the frontmatter namespace, the destinations and the
  `marketplace:` block.
- **The machine file** is `<config-home>/tradecraft/config.yaml`, set by
  `TRADECRAFT_MACHINE_CONFIG` when that is set. It has the same shape and
  fills in each key the project file leaves out.

`<config-home>` comes from [`tiered-dirs`](../tiered-dirs): for example
`~/Library/Application Support` on macOS and `~/.config` on Linux.
`TRADECRAFT_ROOT` and the other `TRADECRAFT_*` variables move it.

Relative paths in a config file resolve against that file's directory. A
flag's path resolves against the working directory.

```yaml
vault: notes
namespace: tc
destinations:
  - root: ~/code/my-project
    target: claude-code
marketplace:
  name: house
  default_plugin: tools
```

### Hooks

`hooks:` names one hooks file per plugin:

```yaml
hooks:
  - from: plugin/hooks.json   # relative to this file
    plugin: tools             # absent means marketplace.default_plugin
```

The file is a Claude Code `hooks.json`, with event names from Claude Code's
hooks reference. `build` renders it into each pack whose harness carries
hooks: the nested shape for Claude Code and Codex, and Cursor's
`{ "version": 1, "hooks": {…} }` shape for Cursor. Pi gets none. A hook a
harness cannot carry is left out of that harness's file. An unknown event or a
malformed entry fails the build, and the error names the file and the entry.

A command names the plugin's files as `${CLAUDE_PLUGIN_ROOT}/…`. Each pack
uses its harness's own variable instead: `CLAUDE_PLUGIN_ROOT` for Claude Code,
`PLUGIN_ROOT` for Codex, `CURSOR_PLUGIN_ROOT` for Cursor. Two placeholders are
filled per pack: `{{harness}}` (the harness name) and `{{event}}` (the event
the hook is under, as the file spells it). Any other `{{…}}` fails the build.

Every pack of the plugin also gets `hooks/gap-report.json`. Per harness, it
lists how the hooks are delivered, each event's support, each hook left out
and why, and the plugin-root variable with its source. `check` reports a stale
or hand-edited report as drift.

## Platforms

The crate is tested on Linux and macOS. Windows is not supported yet. The
tool builds there, but CI does not run its tests on Windows, because about 35
of them fail, most through the `tradecraft-core` path guard. `adopt --from-git` and the
`harness` verbs run `git` and each harness's own command, so those must be on
`PATH`. The minimum supported Rust version is 1.89.

The prebuilt macOS binaries are not signed or notarized yet, so Gatekeeper may
block them on first run. Allow the binary in System Settings, Privacy &
Security, or build it with `cargo install tradecraft`.

## Changes

Each release is listed in the [changelog](CHANGELOG.md).

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
