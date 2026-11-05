---
type: Harness Fact
title: "Agent Skills (agentskills.io): Skills in context at startup"
description: "Skills in context at startup in Agent Skills (agentskills.io), as observed over time."
tags: [skills]
harness: agent-skills
subject: skills/startup-context
observations:
  - value: {"listed": "name and description of every skill", "size": "about 100 tokens per skill", "cap": "no cap stated"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-specification
    locator: "Progressive disclosure"
    evidence: docs
  - value: {"catalog_fields": "name, description, optionally location (path to SKILL.md)"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-client-guide
    locator: "Step 3"
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

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Agent Skills (agentskills.io)](/harnesses/agent-skills.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: name and description of every skill; size: about 100 tokens per skill; cap: no cap stated.[^agentskills-specification]

  > Metadata (~100 tokens): The name and description fields are loaded at startup for all skills
- 2026-11-04: catalog fields: name, description, optionally location (path to SKILL.md). Implementer guide, not the normative spec.[^agentskills-client-guide]

  > For each discovered skill, include name, description, and optionally location (the path to the SKILL.md file)

[^agentskills-specification]: Agent Skills specification
[^agentskills-client-guide]: Agent Skills: how to add skills support to your agent
