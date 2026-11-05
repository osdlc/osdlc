---
type: Harness Fact
title: "Antigravity CLI: Duplicate skill names"
description: "Duplicate skill names in Antigravity CLI, as observed over time."
tags: [skills]
harness: antigravity
subject: skills/duplicate-names
observations: []
open:
  - question: "What happens when the same skill name exists in workspace, global and plugin locations: shadowing, both shown, or an error?"
    observed: "2026-11-04"
    source: antigravity-skills
sources:
  - id: antigravity-skills
    resource: "https://antigravity.google/docs/skills"
    title: "Antigravity docs: Agent skills"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [Antigravity CLI](/harnesses/antigravity.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Open questions

- What happens when the same skill name exists in workspace, global and plugin locations: shadowing, both shown, or an error?[^antigravity-skills]

[^antigravity-skills]: Antigravity docs: Agent skills
