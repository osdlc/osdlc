---
type: Harness Fact
title: "Qwen Code: Skill arguments"
description: "Skill arguments in Qwen Code, as observed over time."
tags: [skills]
harness: qwen-code
subject: skills/arguments
observations:
  - value: {"mechanism": "a file the skill reads, named qwen-skill-args-<skill>.txt", "sanitizing": "characters outside [A-Za-z0-9._-] become _"}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-skills
    evidence: docs
    note: "Quote reconstructed by the fetch tool; no $ARGUMENTS placeholder was reported. Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is there an $ARGUMENTS style placeholder, or only the args file?"
    observed: "2026-11-04"
    source: qwen-code-skills
sources:
  - id: qwen-code-skills
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/"
    title: "Qwen Code docs: Skills"
---

What the sources say about [Skill arguments](/subjects/skills/arguments.md) in [Qwen Code](/harnesses/qwen-code.md).
How text typed after a skill invocation reaches the skill.

## Observations

- 2026-11-04: mechanism: a file the skill reads, named qwen-skill-args-<skill>.txt; sanitizing: characters outside [A-Za-z0-9._-] become _. Quote reconstructed by the fetch tool; no $ARGUMENTS placeholder was reported. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-skills]

  > the file a Skill reads its invocation arguments from replaces every character outside `[A-Za-z0-9._-]` with `_`

## Open questions

- Is there an $ARGUMENTS style placeholder, or only the args file?[^qwen-code-skills]

[^qwen-code-skills]: Qwen Code docs: Skills
