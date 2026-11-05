---
type: Harness Fact
title: "Codex CLI: Unknown frontmatter keys"
description: "Unknown frontmatter keys in Codex CLI, as observed over time."
tags: [skill-frontmatter]
harness: codex
subject: skill-frontmatter/unknown-keys
observations: []
open:
  - question: "What does Codex do with a SKILL.md frontmatter key it does not know (ignore, warn, reject)? The docs state only that name and description are required."
    observed: "2026-11-04"
    source: codex-skills
sources:
  - id: codex-skills
    resource: "https://learn.chatgpt.com/docs/build-skills"
    title: "Codex docs: build skills (redirect target of developers.openai.com/codex/skills)"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [Codex CLI](/harnesses/codex.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Open questions

- What does Codex do with a SKILL.md frontmatter key it does not know (ignore, warn, reject)? The docs state only that name and description are required.[^codex-skills]

[^codex-skills]: Codex docs: build skills (redirect target of developers.openai.com/codex/skills)
