---
type: Harness Fact
title: "Agent Skills (agentskills.io): Skill body size"
description: "Skill body size in Agent Skills (agentskills.io), as observed over time."
tags: [skills]
harness: agent-skills
subject: skills/body-size
observations:
  - value: {"recommendation": "SKILL.md under 500 lines; body under 5000 tokens", "remedy": "move detail to separate files"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-specification
    locator: "Progressive disclosure"
    evidence: docs
open:
  - question: "Does the spec say what a client does with a body past the recommended size?"
    observed: "2026-11-04"
    source: agentskills-specification
sources:
  - id: agentskills-specification
    resource: "https://agentskills.io/specification"
    title: "Agent Skills specification"
---

What the sources say about [Skill body size](/subjects/skills/body-size.md) in [Agent Skills (agentskills.io)](/harnesses/agent-skills.md).
Limits or guidance on the SKILL.md body size, and what happens past them.

## Observations

- 2026-11-04: recommendation: SKILL.md under 500 lines; body under 5000 tokens; remedy: move detail to separate files.[^agentskills-specification]

  > Keep your main SKILL.md under 500 lines. Move detailed reference material to separate files.

## Open questions

- Does the spec say what a client does with a body past the recommended size?[^agentskills-specification]

[^agentskills-specification]: Agent Skills specification
