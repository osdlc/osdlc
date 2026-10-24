---
'@osdlc/waypost': minor
---

First release from osdlc. `way` browses and runs every task in a repository from one list, in a terminal UI, a live web view, `way query`, `--list` and `--json`. It is rebuilt on `@osdlc/system-model` in place of `@osdlc/detect-runners`.

- **Groups.** Besides runner tasks, every surface shows the commands system-model synthesizes from the detected package managers, tool managers and git-hook managers: Tasks, Dependencies, Tools and Git hooks, in that order. The tab bars show a break between groups, and `--json` adds a `groups` array of `{id, title, runners}`.
- **`way providers`.** Lists every registered tool with its roles, runner kind, binary, whether the binary is on PATH, and whether it is built in or custom. `--json` gives the same rows.
- **Your own tools.** `--config <module>` loads a module that exports `tools`, an array of `ToolDef`s, for one run. The `tools` config key loads modules every run: from the user file always, from the project file only once the repository is trusted. `way guide extend` has an example.
- **Arguments.** Typed arguments are bound by each tool's `invoke(task, args)`, so `npm run` gets them after `--`.
- **Node.** Runs on Node 22.22+, 24.15+ and 26; Bun is no longer required. The web view is served through `node:http` and the page script is bundled at build time. Running a development checkout through `way dev` still needs Bun.
- **Names.** The devlink state directories take their overrides from `WAY_ROOT`, `WAY_CONFIG_DIR` and the other `WAY_*` variables, in place of `FLEET_*`, and the vendor segment is `waypost` in place of `com.sizerllc`. Subcommand usage and hints name the `way` command.

Behaviour changes for existing users: the stored probe cache uses system-model's layout, so the first run after upgrading re-probes. Runners that must be executed (moon, mise tasks, sbt) are reported only when the repository uses them. The config file, the trust store and their locations are unchanged. The web view's settings screen refuses to write `tools`; use `way config set tools`.
