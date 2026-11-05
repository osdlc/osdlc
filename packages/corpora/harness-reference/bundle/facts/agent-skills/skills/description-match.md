---
type: Harness Fact
title: "Agent Skills (agentskills.io): Skill picked from its description"
description: "Skill picked from its description in Agent Skills (agentskills.io), as observed over time."
tags: [skills]
harness: agent-skills
subject: skills/description-match
observations:
  - value: {"model_picks_from_description": true, "advice": "say what the skill does and when to use it; include specific keywords"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-specification
    locator: "description field"
    evidence: docs
  - value: {"activation": "most implementations rely on the model's own judgment, not harness-side keyword matching"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-client-guide
    locator: "Model-driven activation"
    evidence: docs
sources:
  - id: agentskills-specification
    resource: "https://agentskills.io/specification"
    title: "Agent Skills specification"
  - id: agentskills-client-guide
    resource: "https://agentskills.io/client-implementation/adding-skills-support"
    title: "Agent Skills: how to add skills support to your agent"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Agent Skills (agentskills.io)](/harnesses/agent-skills.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: model picks from description: yes; advice: say what the skill does and when to use it; include specific keywords.[^agentskills-specification]

  > Should describe both what the skill does and when to use it
- 2026-11-04: activation: most implementations rely on the model's own judgment, not harness-side keyword matching.[^agentskills-client-guide]

  > Most implementations rely on the model's own judgment as the activation mechanism, rather than implementing harness-side trigger matching or keyword detection.

[^agentskills-specification]: Agent Skills specification
[^agentskills-client-guide]: Agent Skills: how to add skills support to your agent
