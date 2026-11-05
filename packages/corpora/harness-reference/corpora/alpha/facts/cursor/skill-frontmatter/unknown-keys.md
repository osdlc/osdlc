---
type: Harness Fact
title: "Cursor: Unknown frontmatter keys"
description: "Unknown frontmatter keys in Cursor, as observed over time."
tags: [skill-frontmatter]
harness: cursor
subject: skill-frontmatter/unknown-keys
observations: []
open:
  - question: "What happens with a frontmatter key outside name, description, paths, disable-model-invocation, icon, color and metadata: ignored, warned or rejected?"
    observed: "2026-11-04"
    source: cursor-skills
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: Agent Skills"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [Cursor](/harnesses/cursor.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Open questions

- What happens with a frontmatter key outside name, description, paths, disable-model-invocation, icon, color and metadata: ignored, warned or rejected?[^cursor-skills]

[^cursor-skills]: Cursor docs: Agent Skills
