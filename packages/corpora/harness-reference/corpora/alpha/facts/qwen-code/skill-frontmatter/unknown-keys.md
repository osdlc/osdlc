---
type: Harness Fact
title: "Qwen Code: Unknown frontmatter keys"
description: "Unknown frontmatter keys in Qwen Code, as observed over time."
tags: [skill-frontmatter]
harness: qwen-code
subject: skill-frontmatter/unknown-keys
observations:
  - value: {"allowed_tools_for_other_agents": "ignored", "validated": ["name", "description", "priority"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "What happens with an arbitrary unknown key: ignored, warned, or rejected?"
    observed: "2026-11-04"
    source: qwen-code-skills
sources:
  - id: qwen-code-skills
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/"
    title: "Qwen Code docs: Skills"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [Qwen Code](/harnesses/qwen-code.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Observations

- 2026-11-04: allowed tools for other agents: ignored; validated: name, description, priority. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-skills]

  > An `allowed-tools` field written for another agent is ignored.

## Open questions

- What happens with an arbitrary unknown key: ignored, warned, or rejected?[^qwen-code-skills]

[^qwen-code-skills]: Qwen Code docs: Skills
