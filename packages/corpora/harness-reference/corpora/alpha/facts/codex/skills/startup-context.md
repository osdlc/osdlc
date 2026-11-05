---
type: Harness Fact
title: "Codex CLI: Skills in context at startup"
description: "Skills in context at startup in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/startup-context
observations:
  - value: {"listed": "name, description and file path of each skill"}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-skills
    locator: "How Codex uses skills"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"budget": "2% of the context window; 8,000 characters when the window is unknown; raise with skills.max_context_tokens up to 10,000 tokens", "over_budget": "descriptions are shortened first; some skills may be omitted with a warning"}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-skills
    locator: "Size limits"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: codex-skills
    resource: "https://learn.chatgpt.com/docs/build-skills"
    title: "Codex docs: build skills (redirect target of developers.openai.com/codex/skills)"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Codex CLI](/harnesses/codex.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: name, description and file path of each skill. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-skills]

  > In Codex, the initial list also includes each skill's file path.
- 2026-11-04: budget: 2% of the context window; 8,000 characters when the window is unknown; raise with skills.max_context_tokens up to 10,000 tokens; over budget: descriptions are shortened first; some skills may be omitted with a warning. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-skills]

  > this list uses at most 2% of the model's context window.

[^codex-skills]: Codex docs: build skills (redirect target of developers.openai.com/codex/skills)
