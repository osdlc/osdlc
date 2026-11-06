---
type: Harness Fact
title: "Kiro: Duplicate skill names"
description: "Duplicate skill names in Kiro, as observed over time."
tags: [skills]
harness: kiro
subject: skills/duplicate-names
observations:
  - value: {"behavior": "workspace skill shadows global skill"}
    since: null
    until: null
    observed: "2026-11-04"
    source: kiro-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "How are duplicates handled across .kiro, .agents and .claude locations and plugins?"
    observed: "2026-11-04"
    source: kiro-skills
sources:
  - id: kiro-skills
    resource: "https://kiro.dev/docs/skills/"
    title: "Kiro docs: Agent Skills"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [Kiro](/harnesses/kiro.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-11-04: behavior: workspace skill shadows global skill. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^kiro-skills]

  > When skills share the same name, workspace skills take priority over global skills.

## Open questions

- How are duplicates handled across .kiro, .agents and .claude locations and plugins?[^kiro-skills]

[^kiro-skills]: Kiro docs: Agent Skills
