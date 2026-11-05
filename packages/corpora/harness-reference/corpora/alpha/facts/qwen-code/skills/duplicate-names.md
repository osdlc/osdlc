---
type: Harness Fact
title: "Qwen Code: Duplicate skill names"
description: "Duplicate skill names in Qwen Code, as observed over time."
tags: [skills]
harness: qwen-code
subject: skills/duplicate-names
observations:
  - value: {"behavior": "first found wins", "order": ["project", "personal", "extension", "bundled"], "extension_skills": "named <extensionName>:<name>, so no collision"}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: qwen-code-skills
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/"
    title: "Qwen Code docs: Skills"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [Qwen Code](/harnesses/qwen-code.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-11-04: behavior: first found wins; order: project, personal, extension, bundled; extension skills: named <extensionName>:<name>, so no collision. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-skills]

  > When two Skills share a name, the first one found wins: project, then personal

[^qwen-code-skills]: Qwen Code docs: Skills
