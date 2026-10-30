---
type: Harness Fact
title: "Cursor: How the agent loads a skill"
description: "How the agent loads a skill in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/agent-loading
observations:
  - value: { mechanism: "selected by description, or explicitly" }
    since: null
    until: null
    observed: "2026-10-01"
    source: cursor-skills
    via: skill-naming
    evidence: docs
open:
  - question: Whether the CLI (cursor-agent) loads skills and plugins the way the IDE does.
    observed: "2026-10-01"
    source: skill-naming
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: skills"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in
[Cursor](/harnesses/cursor.md). The mechanism the model uses to load a skill body.

## Observations

- 2026-10-01: mechanism: selected by description, or explicitly.[^cursor-skills][^skill-naming]

## Open questions

- Whether the CLI (cursor-agent) loads skills and plugins the way the IDE does.[^skill-naming]

[^cursor-skills]: Cursor docs: skills
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
