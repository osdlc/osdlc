---
type: Harness Fact
title: "Gemini CLI: Unknown frontmatter keys"
description: "Unknown frontmatter keys in Gemini CLI, as observed over time."
tags: [skill-frontmatter]
harness: gemini-cli
subject: skill-frontmatter/unknown-keys
observations: []
open:
  - question: "What happens when SKILL.md frontmatter has a key beyond name and description: ignored, warned, or rejected?"
    observed: "2026-11-04"
    source: gemini-cli-skills
sources:
  - id: gemini-cli-skills
    resource: "https://geminicli.com/docs/cli/skills/"
    title: "Gemini CLI docs: Agent Skills"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [Gemini CLI](/harnesses/gemini-cli.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Open questions

- What happens when SKILL.md frontmatter has a key beyond name and description: ignored, warned, or rejected?[^gemini-cli-skills]

[^gemini-cli-skills]: Gemini CLI docs: Agent Skills
