---
type: Harness Fact
title: "Agent Skills (agentskills.io): How the agent loads a skill"
description: "How the agent loads a skill in Agent Skills (agentskills.io), as observed over time."
tags: [skills]
harness: agent-skills
subject: skills/agent-loading
observations:
  - value: {"body_at_startup": false, "body_on": "when the skill is activated", "mechanism": "file read of SKILL.md, or a dedicated activation tool"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-specification
    locator: "Progressive disclosure"
    evidence: docs
  - value: {"user_activation": "/skill-name or $skill-name, besides file-read or dedicated tool activation by the model"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-client-guide
    locator: "Step 4"
    evidence: docs
    note: "Implementer guide, not the normative spec."
sources:
  - id: agentskills-specification
    resource: "https://agentskills.io/specification"
    title: "Agent Skills specification"
  - id: agentskills-client-guide
    resource: "https://agentskills.io/client-implementation/adding-skills-support"
    title: "Agent Skills: how to add skills support to your agent"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in [Agent Skills (agentskills.io)](/harnesses/agent-skills.md).
How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-11-04: body at startup: no; body on: when the skill is activated; mechanism: file read of SKILL.md, or a dedicated activation tool.[^agentskills-specification]

  > Instructions (< 5000 tokens recommended): The full SKILL.md body is loaded when the skill is activated
- 2026-11-04: user activation: /skill-name or $skill-name, besides file-read or dedicated tool activation by the model. Implementer guide, not the normative spec.[^agentskills-client-guide]

  > File-read activation: The model calls its standard file-read tool with the SKILL.md path from the catalog.

[^agentskills-specification]: Agent Skills specification
[^agentskills-client-guide]: Agent Skills: how to add skills support to your agent
