---
type: Harness Fact
title: "Agent Plugins: Skill discovery walk"
description: "Skill discovery walk in Agent Plugins, as observed over time."
tags: [skills]
harness: agent-plugins
subject: skills/discovery-walk
observations:
  - value: {"inside_plugin": "each immediate child directory of skills/ containing a regular file named SKILL.md is one skill"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agent-plugins-specification
    locator: "Skills"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: agent-plugins-specification
    resource: "https://agent-plugins.org/specification"
    title: "Agent Plugins specification"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Agent Plugins](/harnesses/agent-plugins.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: inside plugin: each immediate child directory of skills/ containing a regular file named SKILL.md is one skill. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^agent-plugins-specification]

  > Each immediate child directory containing a path named exactly SKILL.md that resolves to a regular file is treated as one skill.

[^agent-plugins-specification]: Agent Plugins specification
