---
type: Harness Fact
title: "Copilot CLI: Plugin root variable"
description: "Plugin root variable in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/plugin-root-variable
observations:
  - value: {"variable": "${PLUGIN_ROOT} with aliases ${CLAUDE_PLUGIN_ROOT} and ${COPILOT_PLUGIN_ROOT}", "substituted_in": "stdio MCP server args, env values and cwd; LSP cwd and script paths", "not_in": "remote http/sse/streamable-http values"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-plugin-reference
    locator: "Agent Plugins 1.0 MCP servers"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is the variable substituted in SKILL.md bodies?"
    observed: "2026-11-04"
    source: copilot-cli-add-skills
sources:
  - id: copilot-cli-plugin-reference
    resource: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference"
    title: "Copilot docs: CLI plugin reference"
  - id: copilot-cli-add-skills
    resource: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills"
    title: "Copilot docs: add skills to Copilot CLI"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [Copilot CLI](/harnesses/copilot-cli.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Observations

- 2026-11-04: variable: ${PLUGIN_ROOT} with aliases ${CLAUDE_PLUGIN_ROOT} and ${COPILOT_PLUGIN_ROOT}; substituted in: stdio MCP server args, env values and cwd; LSP cwd and script paths; not in: remote http/sse/streamable-http values. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-plugin-reference]

  > ${PLUGIN_ROOT} (or its ${CLAUDE_PLUGIN_ROOT}/${COPILOT_PLUGIN_ROOT} aliases) expands to the plugin's root directory.

## Open questions

- Is the variable substituted in SKILL.md bodies?[^copilot-cli-add-skills]

[^copilot-cli-plugin-reference]: Copilot docs: CLI plugin reference
[^copilot-cli-add-skills]: Copilot docs: add skills to Copilot CLI
