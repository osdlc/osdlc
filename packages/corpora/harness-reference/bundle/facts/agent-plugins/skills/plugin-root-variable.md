---
type: Harness Fact
title: "Agent Plugins: Plugin root variable"
description: "Plugin root variable in Agent Plugins, as observed over time."
tags: [skills]
harness: agent-plugins
subject: skills/plugin-root-variable
observations:
  - value: {"variables": ["PLUGIN_ROOT", "PLUGIN_DATA"], "plugin_root": "absolute path of the filesystem-resolved plugin root", "substituted_in": "MCP stdio args, env values and cwd", "not_in": "env keys, command, fixed component locations, http url"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agent-plugins-specification
    locator: "Variables"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"requirement": "clients MUST expand in supported configuration fields"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agent-plugins-specification
    locator: "MCP configuration"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does the spec say whether ${PLUGIN_ROOT} is substituted in SKILL.md bodies or hook files? The fetched text is silent on skills and hooks."
    observed: "2026-11-04"
    source: agent-plugins-specification
sources:
  - id: agent-plugins-specification
    resource: "https://agent-plugins.org/specification"
    title: "Agent Plugins specification"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [Agent Plugins](/harnesses/agent-plugins.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Observations

- 2026-11-04: variables: PLUGIN_ROOT, PLUGIN_DATA; plugin root: absolute path of the filesystem-resolved plugin root; substituted in: MCP stdio args, env values and cwd; not in: env keys, command, fixed component locations, http url. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^agent-plugins-specification]

  > PLUGIN_ROOT is the absolute path to the filesystem-resolved plugin root.
- 2026-11-04: requirement: clients MUST expand in supported configuration fields. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^agent-plugins-specification]

  > Clients MUST expand ${PLUGIN_ROOT} and ${PLUGIN_DATA} in supported configuration fields.

## Open questions

- Does the spec say whether ${PLUGIN_ROOT} is substituted in SKILL.md bodies or hook files? The fetched text is silent on skills and hooks.[^agent-plugins-specification]

[^agent-plugins-specification]: Agent Plugins specification
