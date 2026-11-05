---
type: Harness Fact
title: "pi: Skill arguments"
description: "Skill arguments in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/arguments
observations:
  - value: {"supported": true, "mechanism": "appended to the loaded instructions as a user request", "syntax": "/skill:name <text>"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-skills
    locator: "Understand how skills load"
    evidence: docs
sources:
  - id: pi-skills
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/skills.md"
    title: "Pi docs: Skills (main at d57c2d2)"
---

What the sources say about [Skill arguments](/subjects/skills/arguments.md) in [pi](/harnesses/pi.md).
How text typed after a skill invocation reaches the skill.

## Observations

- 2026-11-04: supported: yes; mechanism: appended to the loaded instructions as a user request; syntax: /skill:name <text>.[^pi-skills]

  > Arguments after `/skill:name` are appended to the loaded instructions as a user request:

[^pi-skills]: Pi docs: Skills (main at d57c2d2)
