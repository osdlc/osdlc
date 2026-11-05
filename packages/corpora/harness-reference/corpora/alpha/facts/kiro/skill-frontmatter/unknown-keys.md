---
type: Harness Fact
title: "Kiro: Unknown frontmatter keys"
description: "Unknown frontmatter keys in Kiro, as observed over time."
tags: [skill-frontmatter]
harness: kiro
subject: skill-frontmatter/unknown-keys
observations:
  - value: {"documented_keys": ["name", "description", "license", "compatibility", "metadata"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: kiro-skills
    evidence: docs
    note: "Only the documented keys are listed; behavior for others is not stated. Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "What happens with a frontmatter key outside name, description, license, compatibility and metadata?"
    observed: "2026-11-04"
    source: kiro-skills
sources:
  - id: kiro-skills
    resource: "https://kiro.dev/docs/skills/"
    title: "Kiro docs: Agent Skills"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [Kiro](/harnesses/kiro.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Observations

- 2026-11-04: documented keys: name, description, license, compatibility, metadata. Only the documented keys are listed; behavior for others is not stated. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^kiro-skills]

  > `name` (required): "Must match folder name."

## Open questions

- What happens with a frontmatter key outside name, description, license, compatibility and metadata?[^kiro-skills]

[^kiro-skills]: Kiro docs: Agent Skills
