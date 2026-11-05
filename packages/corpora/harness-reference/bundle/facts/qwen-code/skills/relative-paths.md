---
type: Harness Fact
title: "Qwen Code: Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in Qwen Code, as observed over time."
tags: [skills]
harness: qwen-code
subject: skills/relative-paths
observations:
  - value: {"env_var": "QWEN_SKILL_ROOT is set to the skill directory (for hook commands)", "tells_model": "not stated"}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "What folder do relative paths in the SKILL.md body resolve from, and is the folder shown to the model?"
    observed: "2026-11-04"
    source: qwen-code-skills
sources:
  - id: qwen-code-skills
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/"
    title: "Qwen Code docs: Skills"
---

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [Qwen Code](/harnesses/qwen-code.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Observations

- 2026-11-04: env var: QWEN_SKILL_ROOT is set to the skill directory (for hook commands); tells model: not stated. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-skills]

  > `$QWEN_SKILL_ROOT` is set to the Skill's own directory, so hook commands can reference files shipped alongside `SKILL.md`.

## Open questions

- What folder do relative paths in the SKILL.md body resolve from, and is the folder shown to the model?[^qwen-code-skills]

[^qwen-code-skills]: Qwen Code docs: Skills
