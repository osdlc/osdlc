---
type: Harness Fact
title: "Antigravity CLI: Plugin root variable"
description: "Plugin root variable in Antigravity CLI, as observed over time."
tags: [skills]
harness: antigravity
subject: skills/plugin-root-variable
observations:
  - value: {"variable": "${PLUGIN_ROOT}", "substituted_in": ["MCP server args", "MCP server cwd", "MCP server env values"], "also_env_var": "PLUGIN_ROOT for plugin MCP servers", "hooks": "not used; hooks run with the plugin root as working directory"}
    since: null
    until: null
    observed: "2026-11-04"
    source: antigravity-build-plugins
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is ${PLUGIN_ROOT} substituted inside a SKILL.md body?"
    observed: "2026-11-04"
    source: antigravity-skills
sources:
  - id: antigravity-build-plugins
    resource: "https://antigravity.google/docs/build-plugins/"
    title: "Antigravity docs: Build plugins"
  - id: antigravity-skills
    resource: "https://antigravity.google/docs/skills"
    title: "Antigravity docs: Agent skills"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [Antigravity CLI](/harnesses/antigravity.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Observations

- 2026-11-04: variable: ${PLUGIN_ROOT}; substituted in: MCP server args, MCP server cwd, MCP server env values; also env var: PLUGIN_ROOT for plugin MCP servers; hooks: not used; hooks run with the plugin root as working directory. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^antigravity-build-plugins]

  > Expanded in `args`, `cwd`, and custom `env` values in MCP server definitions.

## Open questions

- Is ${PLUGIN_ROOT} substituted inside a SKILL.md body?[^antigravity-skills]

[^antigravity-build-plugins]: Antigravity docs: Build plugins
[^antigravity-skills]: Antigravity docs: Agent skills
