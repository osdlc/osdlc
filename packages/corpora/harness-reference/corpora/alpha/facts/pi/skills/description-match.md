---
type: Harness Fact
title: "pi: Skill picked from its description"
description: "Skill picked from its description in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/description-match
observations:
  - value: {"model_picks_from_description": true, "reliability": "a model might fail to load a relevant skill; force with /skill:name"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-skills
    locator: "Understand how skills load"
    evidence: docs
  - value: {"writing_guidance": "state what the skill does and when it applies"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-skills
    locator: "Create a skill"
    evidence: docs
sources:
  - id: pi-skills
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/skills.md"
    title: "Pi docs: Skills (main at d57c2d2)"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [pi](/harnesses/pi.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: model picks from description: yes; reliability: a model might fail to load a relevant skill; force with /skill:name.[^pi-skills]

  > A model might fail to load a relevant skill, so use `/skill:name` when you need to force it.
- 2026-11-04: writing guidance: state what the skill does and when it applies.[^pi-skills]

  > State both what the skill does and when it applies. Avoid descriptions such as “Helps with PDFs,” which do not provide enough routing information.

[^pi-skills]: Pi docs: Skills (main at d57c2d2)
