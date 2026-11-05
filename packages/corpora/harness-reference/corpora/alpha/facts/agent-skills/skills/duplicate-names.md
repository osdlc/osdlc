---
type: Harness Fact
title: "Agent Skills (agentskills.io): Duplicate skill names"
description: "Duplicate skill names in Agent Skills (agentskills.io), as observed over time."
tags: [skills]
harness: agent-skills
subject: skills/duplicate-names
observations:
  - value: {"across_scopes": "project-level overrides user-level (universal convention)", "within_scope": "first-found or last-found, pick one and be consistent", "collision": "log a warning that a skill was shadowed"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-client-guide
    locator: "Handling name collisions"
    evidence: docs
    note: "Implementer guide, not the normative spec."
sources:
  - id: agentskills-client-guide
    resource: "https://agentskills.io/client-implementation/adding-skills-support"
    title: "Agent Skills: how to add skills support to your agent"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [Agent Skills (agentskills.io)](/harnesses/agent-skills.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-11-04: across scopes: project-level overrides user-level (universal convention); within scope: first-found or last-found, pick one and be consistent; collision: log a warning that a skill was shadowed. Implementer guide, not the normative spec.[^agentskills-client-guide]

  > The universal convention across existing implementations: project-level skills override user-level skills.

[^agentskills-client-guide]: Agent Skills: how to add skills support to your agent
