---
type: Harness Fact
title: "Cursor: Plugin root variable"
description: "Plugin root variable in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/plugin-root-variable
observations:
  - value: {"variables": ["${CURSOR_PLUGIN_ROOT}", "${CLAUDE_PLUGIN_ROOT}"], "substituted_in": ["command", "args", "env values", "cwd"], "context": "mcp.json", "not_expanded": ["${PLUGIN_ROOT}", "${PLUGIN_DATA}"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-plugins-reference
    locator: "MCP servers"
    evidence: docs
open:
  - question: "Is any plugin root variable substituted in a skill body or in hooks config?"
    observed: "2026-11-04"
    source: cursor-skills
sources:
  - id: cursor-plugins-reference
    resource: "https://cursor.com/docs/reference/plugins"
    title: "Cursor docs: Plugins reference"
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: Agent Skills"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [Cursor](/harnesses/cursor.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Observations

- 2026-11-04: variables: ${CURSOR_PLUGIN_ROOT}, ${CLAUDE_PLUGIN_ROOT}; substituted in: command, args, env values, cwd; context: mcp.json; not expanded: ${PLUGIN_ROOT}, ${PLUGIN_DATA}.[^cursor-plugins-reference]

  > Cursor expands `${CURSOR_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` to the plugin's install path in `command`, `args`, `env` values, and `cwd`.

## Open questions

- Is any plugin root variable substituted in a skill body or in hooks config?[^cursor-skills]

[^cursor-plugins-reference]: Cursor docs: Plugins reference
[^cursor-skills]: Cursor docs: Agent Skills
