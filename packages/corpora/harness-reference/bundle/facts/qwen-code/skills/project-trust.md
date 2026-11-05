---
type: Harness Fact
title: "Qwen Code: Project skills and folder trust"
description: "Project skills and folder trust in Qwen Code, as observed over time."
tags: [skills]
harness: qwen-code
subject: skills/project-trust
observations:
  - value: {"supported": "partial", "scope": "project skill hooks are registered only in a trusted folder"}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Are project skills themselves (not only their hooks) withheld in an untrusted folder?"
    observed: "2026-11-04"
    source: qwen-code-skills
sources:
  - id: qwen-code-skills
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/"
    title: "Qwen Code docs: Skills"
---

What the sources say about [Project skills and folder trust](/subjects/skills/project-trust.md) in [Qwen Code](/harnesses/qwen-code.md).
Whether project skills load only after the user trusts the folder.

## Observations

- 2026-11-04: supported: partial; scope: project skill hooks are registered only in a trusted folder. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-skills]

  > A project Skill's hooks run repo-supplied commands, so they are registered only in a trusted folder.

## Open questions

- Are project skills themselves (not only their hooks) withheld in an untrusted folder?[^qwen-code-skills]

[^qwen-code-skills]: Qwen Code docs: Skills
