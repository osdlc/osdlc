---
type: Harness Fact
title: "pi: Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/relative-paths
observations:
  - value: {"resolves_from": "skill directory", "model_told_location": true}
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

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [pi](/harnesses/pi.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Observations

- 2026-11-04: resolves from: skill directory; model told location: yes.[^pi-skills]

  > Use relative paths from the skill directory when referring to bundled files. Pi tells the model where the skill lives so it can resolve those paths.

[^pi-skills]: Pi docs: Skills (main at d57c2d2)
