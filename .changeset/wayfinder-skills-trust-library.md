---
"@osdlc/wayfinder": minor
---

wayfinder lists agent skills, trusts single tools, says what each tool is, and can be used as a library.

New:

- A Skills group lists the agent skills in `.claude/skills`, `.agents/skills` and `.cursor/skills`, read by `@osdlc/detect-harness` without running anything. `list` and `query` print a `/<name> [hint]` line for each, and the `catalog` and `query` documents carry them in `skills`. Search matches a skill's name and description. `way run /<name>` explains that an agent runs skills. The user setting `skills` chooses `project` (the default), `all` (adds your own and your plugins' skills from the home folder) or `off`.
- Per-tool trust decides which runners run in a repository that is not trusted as a whole. `way trust --scope <tool>` trusts one tool, and `trust.tools.<tool>` in the user config does the same by path or owner. A runner needs its own id trusted, plus each tool manager that runs commands through itself: in a repository with a `mise.toml`, moon needs `mise` too. A withheld runner's entry in `unknowns` lists the grants it still needs in `missing`.
- `way providers` shows each tool's language and homepage, and `--json` adds `homepage`, `description`, `ecosystem` and `language`.
- The root entry `@osdlc/wayfinder` exports `buildCatalog`, which returns the same document as `way list --json`, plus `filterTasks`, `filterSkills`, the groups, the labels, `terminalSafe` and the document types.
- Terminal text also replaces the bidi marks U+061C, U+200E and U+200F with U+FFFD, the same characters `@osdlc/ux` `stripControls` removes.

Breaking changes, and what to do:

- The `catalog` and `query` documents have a required `skills` array, and `groups` can hold a `skills` group with no runners. A strict parser must allow them. Set `skills` to `off` to list none.
- A withheld unknown's `reason` can be `tool-untrusted`, and it can carry `missing`. Handle the new value where you switch on `reason`.
- `way providers` text has two more columns, `language` and `homepage`. Read `--json` instead of parsing the table.
- A project file's `skills` is ignored with a warning, as `theme` is. Set it in your user config.
