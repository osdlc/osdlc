---
type: Harness Fact
title: "Agent Skills (agentskills.io): Project skills and folder trust"
description: "Project skills and folder trust in Agent Skills (agentskills.io), as observed over time."
tags: [skills]
harness: agent-skills
subject: skills/project-trust
observations:
  - value: {"supported": "partial", "detail": "guide suggests gating project-level skills on a trust check; not mandated"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-client-guide
    locator: "Trust considerations"
    evidence: docs
    note: "Implementer guide, not the normative spec."
sources:
  - id: agentskills-client-guide
    resource: "https://agentskills.io/client-implementation/adding-skills-support"
    title: "Agent Skills: how to add skills support to your agent"
---

What the sources say about [Project skills and folder trust](/subjects/skills/project-trust.md) in [Agent Skills (agentskills.io)](/harnesses/agent-skills.md).
Whether project skills load only after the user trusts the folder.

## Observations

- 2026-11-04: supported: partial; detail: guide suggests gating project-level skills on a trust check; not mandated. Implementer guide, not the normative spec.[^agentskills-client-guide]

  > Consider gating project-level skill loading on a trust check — only load them if the user has marked the project folder as trusted.

[^agentskills-client-guide]: Agent Skills: how to add skills support to your agent
