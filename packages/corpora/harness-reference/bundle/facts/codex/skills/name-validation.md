---
type: Harness Fact
title: "Codex CLI: Skill name validation"
description: "Skill name validation in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/name-validation
observations:
  - value: { checks: "length only (`MAX_NAME_LEN`); `MAX_QUALIFIED_NAME_LEN` after prefixing" }
    since: null
    until: null
    observed: "2026-10-01"
    source: codex-repo
    via: skill-naming
    locator: codex-rs/skills/src/parser.rs at 57ac6f5
    evidence: source
sources:
  - id: codex-repo
    resource: "https://github.com/openai/codex"
    title: openai/codex source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Skill name validation](/subjects/skills/name-validation.md) in
[Codex CLI](/harnesses/codex.md). What the harness checks about a skill name, and whether a failure
blocks loading.

## Observations

- 2026-10-01: checks: length only (`MAX_NAME_LEN`); `MAX_QUALIFIED_NAME_LEN` after
  prefixing.[^codex-repo][^skill-naming]

[^codex-repo]: openai/codex source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
