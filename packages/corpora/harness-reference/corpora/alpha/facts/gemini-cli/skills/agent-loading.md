---
type: Harness Fact
title: "Gemini CLI: How the agent loads a skill"
description: "How the agent loads a skill in Gemini CLI, as observed over time."
tags: [skills]
harness: gemini-cli
subject: skills/agent-loading
observations:
  - value: {"mechanism": "activate_skill tool", "loads": "when the task matches a skill description, after user approval"}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: gemini-cli-skills
    resource: "https://geminicli.com/docs/cli/skills/"
    title: "Gemini CLI docs: Agent Skills"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in [Gemini CLI](/harnesses/gemini-cli.md).
How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-11-04: mechanism: activate_skill tool; loads: when the task matches a skill description, after user approval. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-skills]

  > it calls the `activate_skill` tool. ... The `SKILL.md` body and folder structure is added to the conversation history.

[^gemini-cli-skills]: Gemini CLI docs: Agent Skills
