---
type: Harness Fact
title: "Gemini CLI: Skill picked from its description"
description: "Skill picked from its description in Gemini CLI, as observed over time."
tags: [skills]
harness: gemini-cli
subject: skills/description-match
observations:
  - value: {"supported": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"guidance": "description is how the model decides when to use the skill; be specific about tasks and trigger keywords"}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-creating-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: gemini-cli-skills
    resource: "https://geminicli.com/docs/cli/skills/"
    title: "Gemini CLI docs: Agent Skills"
  - id: gemini-cli-creating-skills
    resource: "https://geminicli.com/docs/cli/creating-skills/"
    title: "Gemini CLI docs: Creating skills"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Gemini CLI](/harnesses/gemini-cli.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: supported: yes. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-skills]

  > When Gemini identifies a task matching a skill's description, it calls the `activate_skill` tool.
- 2026-11-04: guidance: description is how the model decides when to use the skill; be specific about tasks and trigger keywords. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-creating-skills]

  > This is how Gemini decides when to use the skill.

[^gemini-cli-skills]: Gemini CLI docs: Agent Skills
[^gemini-cli-creating-skills]: Gemini CLI docs: Creating skills
