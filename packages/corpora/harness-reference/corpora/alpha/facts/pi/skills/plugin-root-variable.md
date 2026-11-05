---
type: Harness Fact
title: "pi: Plugin root variable"
description: "Plugin root variable in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/plugin-root-variable
observations: []
open:
  - question: "Does Pi substitute any variable naming the package folder in a skill body or config? The packages page names none."
    observed: "2026-11-04"
    source: pi-skills
sources:
  - id: pi-skills
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/skills.md"
    title: "Pi docs: Skills (main at d57c2d2)"
---

What the sources say about [Plugin root variable](/subjects/skills/plugin-root-variable.md) in [pi](/harnesses/pi.md).
Variables a skill can use to name its plugin's folder, such as `${CLAUDE_PLUGIN_ROOT}`, and where they are substituted.

## Open questions

- Does Pi substitute any variable naming the package folder in a skill body or config? The packages page names none.[^pi-skills]

[^pi-skills]: Pi docs: Skills (main at d57c2d2)
