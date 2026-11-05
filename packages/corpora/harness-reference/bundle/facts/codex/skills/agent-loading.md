---
type: Harness Fact
title: "Codex CLI: How the agent loads a skill"
description: "How the agent loads a skill in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/agent-loading
observations:
  - value: { mechanism: reads the advertised skill file }
    since: null
    until: null
    observed: "2026-10-01"
    source: codex-repo
    via: skill-naming
    evidence: source
    note: "Structured `UserInput::Skill { name, path }` mentions resolve by path first."
  - value: {"body_at_startup": false, "body_on": "when Codex decides to use the skill (task matches description) or the user invokes it with $ or /skills"}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-skills
    locator: "How Codex uses skills"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: codex-repo
    resource: "https://github.com/openai/codex"
    title: openai/codex source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
  - id: codex-skills
    resource: "https://learn.chatgpt.com/docs/build-skills"
    title: "Codex docs: build skills (redirect target of developers.openai.com/codex/skills)"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in
[Codex CLI](/harnesses/codex.md). How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-10-01: mechanism: reads the advertised skill file. Structured
  `UserInput::Skill { name, path }` mentions resolve by path first.[^codex-repo][^skill-naming]
- 2026-11-04: body at startup: no; body on: when Codex decides to use the skill (task matches description) or the user invokes it with $ or /skills. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-skills]

  > Skills use progressive disclosure to manage context efficiently.

[^codex-repo]: openai/codex source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
[^codex-skills]: Codex docs: build skills (redirect target of developers.openai.com/codex/skills)
