---
'@osdlc/cli-tool': minor
---

A CLI can now be declared as a tree of commands. The new `@osdlc/cli-tool/command` entry has `defineCommand`, `defineGroup`, `commandKit` (for typed global flags) and `defineApp`. Each command declares its flags, arguments and a Zod output once. The app routes the command line, prints the output as text, or under `--json` as one document that starts with `schemaVersion` and `kind`, and adds `help` (with `--depth`, `--full`, `--all` and a JSON form), `schema` (each command's input and output JSON Schema), `--help` on every command and `--version`. `loadCommandTree` builds the tree from a directory of command files. Zod is a peer dependency of these entries; the root entry still does not load it.

Shared commands: `@osdlc/cli-tool/config-command` (`configCommands(store)`), `@osdlc/cli-tool/trust-command` (`trustCommand(service)`) and `@osdlc/cli-tool/guide` (`guideCommand(topics, { title })`). Each takes the tool's own store, trust service or topics. `@osdlc/cli-tool/testing` has `runApp`, `checkApp` and `checkGuide` for a tool's tests. All of these are experimental.

The root entry adds `wrapText`, `helpWidth`, `columns`, `colorEnabled` and an optional `CliContext.terminal`, which `processContext()` fills in. `defineCli` takes a `width` and now reflows its epilogues when it renders help: lines at column 0 are filled again, indented lines are kept. If a test compares a tool's help text, update the expected text.

Breaking, for devlink users on macOS: link state moves from `~/Library/Application Support/<tool>/` to `${XDG_CONFIG_HOME:-~/.config}/<tool>/`, the `xdg` convention, and the launcher reads it there. Run `<tool> dev link` again to restore a link, or move the `home` and `history.jsonl` files. Linux paths do not change. `runDevCli` on Windows now prints that `<tool> dev` is not available there and exits 1. A committed launcher must be rendered again (`launcherDrift` reports it).
