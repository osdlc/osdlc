---
type: Harness Fact
title: "Codex CLI: Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/relative-paths
observations: []
open:
  - question: "What folder does a relative path inside SKILL.md resolve from, and does Codex tell the model the skill's folder when the skill loads?"
    observed: "2026-11-04"
    source: codex-skills
sources:
  - id: codex-skills
    resource: "https://learn.chatgpt.com/docs/build-skills"
    title: "Codex docs: build skills (redirect target of developers.openai.com/codex/skills)"
---

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [Codex CLI](/harnesses/codex.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Open questions

- What folder does a relative path inside SKILL.md resolve from, and does Codex tell the model the skill's folder when the skill loads?[^codex-skills]

[^codex-skills]: Codex docs: build skills (redirect target of developers.openai.com/codex/skills)
