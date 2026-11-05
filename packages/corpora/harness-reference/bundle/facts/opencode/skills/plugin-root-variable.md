---
type: Harness Fact
title: "OpenCode: Plugin root variable"
description: "Plugin root variable in OpenCode, as observed over time."
tags: [skills]
harness: opencode
subject: skills/plugin-root-variable
observations: []
open:
  - question: "Does OpenCode substitute a variable naming a plugin or skill folder? The plugins page describes JS plugins and names none."
    observed: "2026-11-04"
    source: opencode-skills
sources:
  - id: opencode-skills
    resource: "https://opencode.ai/docs/skills"
    title: "OpenCode docs: Agent Skills"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [OpenCode](/harnesses/opencode.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Open questions

- Does OpenCode substitute a variable naming a plugin or skill folder? The plugins page describes JS plugins and names none.[^opencode-skills]

[^opencode-skills]: OpenCode docs: Agent Skills
