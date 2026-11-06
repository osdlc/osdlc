---
type: Harness Fact
title: "Amp: Plugin root variable"
description: "Plugin root variable in Amp, as observed over time."
tags: [skills]
harness: amp
subject: skills/plugin-root-variable
observations:
  - value: {"variable": "AMP_SKILL_DIR", "meaning": "absolute path of the skill directory", "substituted_in": ["command", "args", "env values of a skill MCP server"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "MCP Servers in Skills"
    evidence: docs
    note: "Names the skill folder, not a plugin folder."
open:
  - question: "Is there a variable naming a plugin folder, and is any variable substituted in a skill body?"
    observed: "2026-11-04"
    source: amp-skills
sources:
  - id: amp-skills
    resource: "https://ampcode.com/docs/markdown/customize/skills"
    title: "Amp docs: Skills"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [Amp](/harnesses/amp.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Observations

- 2026-11-04: variable: AMP_SKILL_DIR; meaning: absolute path of the skill directory; substituted in: command, args, env values of a skill MCP server. Names the skill folder, not a plugin folder.[^amp-skills]

  > Amp sets `AMP_SKILL_DIR` in each local server's environment to the absolute path of the skill directory.

## Open questions

- Is there a variable naming a plugin folder, and is any variable substituted in a skill body?[^amp-skills]

[^amp-skills]: Amp docs: Skills
