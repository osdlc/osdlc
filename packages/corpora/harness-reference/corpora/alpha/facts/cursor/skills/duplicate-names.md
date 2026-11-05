---
type: Harness Fact
title: "Cursor: Duplicate skill names"
description: "Duplicate skill names in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/duplicate-names
observations: []
open:
  - question: "What happens when two skills share a name, within one scope and across .agents/, .cursor/, .claude/ and .codex/ locations?"
    observed: "2026-11-04"
    source: cursor-skills
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: Agent Skills"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [Cursor](/harnesses/cursor.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Open questions

- What happens when two skills share a name, within one scope and across .agents/, .cursor/, .claude/ and .codex/ locations?[^cursor-skills]

[^cursor-skills]: Cursor docs: Agent Skills
