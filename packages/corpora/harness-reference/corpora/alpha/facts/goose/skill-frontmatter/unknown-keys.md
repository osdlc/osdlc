---
type: Harness Fact
title: "Goose: Unknown frontmatter keys"
description: "Unknown frontmatter keys in Goose, as observed over time."
tags: [skill-frontmatter]
harness: goose
subject: skill-frontmatter/unknown-keys
observations: []
open:
  - question: "What happens with an unknown frontmatter key? The source skips a skill missing name or with / in the name, but unknown keys are not addressed in the docs."
    observed: "2026-11-04"
    source: goose-skills
sources:
  - id: goose-skills
    resource: "https://goose-docs.ai/docs/guides/context-engineering/using-skills"
    title: "goose docs: Skills"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [Goose](/harnesses/goose.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Open questions

- What happens with an unknown frontmatter key? The source skips a skill missing name or with / in the name, but unknown keys are not addressed in the docs.[^goose-skills]

[^goose-skills]: goose docs: Skills
