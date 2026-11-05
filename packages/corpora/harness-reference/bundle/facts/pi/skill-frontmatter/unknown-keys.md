---
type: Harness Fact
title: "pi: Unknown frontmatter keys"
description: "Unknown frontmatter keys in pi, as observed over time."
tags: [skill-frontmatter]
harness: pi
subject: skill-frontmatter/unknown-keys
observations: []
open:
  - question: "What happens to a frontmatter key outside the Agent Skills fields? The skills page says only that most invalid fields produce warnings and that malformed SKILL.md files are not loaded."
    observed: "2026-11-04"
    source: pi-skills
sources:
  - id: pi-skills
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/skills.md"
    title: "Pi docs: Skills (main at d57c2d2)"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [pi](/harnesses/pi.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Open questions

- What happens to a frontmatter key outside the Agent Skills fields? The skills page says only that most invalid fields produce warnings and that malformed SKILL.md files are not loaded.[^pi-skills]

[^pi-skills]: Pi docs: Skills (main at d57c2d2)
