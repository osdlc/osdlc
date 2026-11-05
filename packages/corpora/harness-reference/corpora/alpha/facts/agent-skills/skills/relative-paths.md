---
type: Harness Fact
title: "Agent Skills (agentskills.io): Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in Agent Skills (agentskills.io), as observed over time."
tags: [skills]
harness: agent-skills
subject: skills/relative-paths
observations:
  - value: {"resolves_from": "the skill root (the skill directory)"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-specification
    locator: "File references"
    evidence: docs
  - value: {"tells_model": "include the skill directory path and note that relative paths are relative to it"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-client-guide
    locator: "Structured wrapping"
    evidence: docs
    note: "Implementer guide example, not normative."
sources:
  - id: agentskills-specification
    resource: "https://agentskills.io/specification"
    title: "Agent Skills specification"
  - id: agentskills-client-guide
    resource: "https://agentskills.io/client-implementation/adding-skills-support"
    title: "Agent Skills: how to add skills support to your agent"
---

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [Agent Skills (agentskills.io)](/harnesses/agent-skills.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Observations

- 2026-11-04: resolves from: the skill root (the skill directory).[^agentskills-specification]

  > When referencing other files in your skill, use relative paths from the skill root
- 2026-11-04: tells model: include the skill directory path and note that relative paths are relative to it. Implementer guide example, not normative.[^agentskills-client-guide]

  > Skill directory: …/.agents/skills/pdf-processing
Relative paths in this skill are relative to the skill directory.

[^agentskills-specification]: Agent Skills specification
[^agentskills-client-guide]: Agent Skills: how to add skills support to your agent
