---
type: Harness Probe
title: Plugin folder layout
description: "Load a built plugin from a local folder and run a script it ships, to see where the plugin lives, how the skill names that folder, and whether the script keeps its exec bit."
tags: [plugins, skills]
subjects:
  - skills/plugin-root-variable
  - skills/relative-paths
  - plugins/install-location
  - plugins/install-copy
harnesses: [cursor, claude-code]
commands:
  cursor:
    - "(cd fixture && skillwright build)"
    - "cursor-agent --version"
    - "ls -l fixture/out/.cursor-plugin/packs/layout-probe/bin/tool"
    - 'cursor-agent -p --trust --force --output-format stream-json --plugin-dir fixture/out/.cursor-plugin/packs/layout-probe "use the probe skill"'
  claude-code:
    - "(cd fixture && skillwright build)"
    - "claude --version"
    - "ls -l fixture/out/.claude-plugin/packs/layout-probe/bin/tool"
    - 'claude -p --plugin-dir fixture/out/.claude-plugin/packs/layout-probe "use the probe skill"'
record:
  - The harness version.
  - Whether the `probe` skill was found, and the name it ran under.
  - "The script output: the `LAYOUT-PROBE-OK` marker, `argv0` and `pwd`."
  - The absolute path the agent reports for SKILL.md, reduced to its shape (for example a cache folder or the `--plugin-dir` folder), never a full home path.
  - "Whether `bin/tool` kept its exec bit, from `ls -l` and from whether the run could execute it."
  - "How the built SKILL.md names the script: `${CLAUDE_PLUGIN_ROOT}/bin/tool` for Claude Code, `../../bin/tool` for Cursor."
safety:
  - "`--force` lets Cursor run shell commands without asking. The only command the skill asks for is the fixture's `bin/tool`, which prints three lines."
  - "`--trust` trusts the working folder for this run."
  - "Both runs use the account the CLI is signed in to, and count against its usage."
  - "`skillwright build` writes only `fixture/out/`, which is ignored by git."
---

# Plugin folder layout

The fixture is a skillwright vault with one marketplace (`probe-market`), one plugin
(`layout-probe`) and one skill (`probe`). The plugin ships `bin/tool`, copied from
`scripts/tool`, a script that prints a marker, its `argv0` and its working directory.

The skill tells the agent to run the tool and report the output, the path of SKILL.md and the
working directory. The source note writes the path as `${CLAUDE_PLUGIN_ROOT}/bin/tool`.
skillwright keeps that variable for Claude Code and rewrites it to a path relative to the skill
folder (`../../bin/tool`) for Cursor, which has no such variable.

`skillwright build` reads `fixture/skillwright.yaml` and writes one pack per harness under
`fixture/out/`. Each run loads that pack with `--plugin-dir`, so nothing is installed.

A run answers:

- whether the harness resolves the variable or the relative path to the plugin folder;
- which folder a relative path resolves from, and whether the agent knew the skill's folder;
- whether a `--plugin-dir` plugin is used in place or copied;
- whether the script kept its exec bit.
