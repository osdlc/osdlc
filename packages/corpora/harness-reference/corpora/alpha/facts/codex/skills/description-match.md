---
type: Harness Fact
title: "Codex CLI: Skill picked from its description"
description: "Skill picked from its description in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/description-match
observations:
  - value: {"model_picks_from_description": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-skills
    locator: "How Codex uses skills"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"advice": "state exactly when the skill should and should not trigger"}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-skills
    locator: "Create a skill, example description"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Do the docs name a model or give a reliability figure for implicit skill selection?"
    observed: "2026-11-04"
    source: codex-skills
sources:
  - id: codex-skills
    resource: "https://learn.chatgpt.com/docs/build-skills"
    title: "Codex docs: build skills (redirect target of developers.openai.com/codex/skills)"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Codex CLI](/harnesses/codex.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: model picks from description: yes. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-skills]

  > ChatGPT or Codex can choose a skill when your task matches the skill description.
- 2026-11-04: advice: state exactly when the skill should and should not trigger. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-skills]

  > Explain exactly when this skill should and should not trigger.

## Open questions

- Do the docs name a model or give a reliability figure for implicit skill selection?[^codex-skills]

[^codex-skills]: Codex docs: build skills (redirect target of developers.openai.com/codex/skills)
