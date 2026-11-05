---
type: Harness Fact
title: "OpenCode: Unknown frontmatter keys"
description: "Unknown frontmatter keys in OpenCode, as observed over time."
tags: [skill-frontmatter]
harness: opencode
subject: skill-frontmatter/unknown-keys
observations:
  - value: {"behavior": "ignored"}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-skills
    locator: "Write frontmatter"
    evidence: docs
sources:
  - id: opencode-skills
    resource: "https://opencode.ai/docs/skills"
    title: "OpenCode docs: Agent Skills"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [OpenCode](/harnesses/opencode.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Observations

- 2026-11-04: behavior: ignored.[^opencode-skills]

  > Unknown frontmatter fields are ignored.

[^opencode-skills]: OpenCode docs: Agent Skills
