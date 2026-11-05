---
type: Harness Fact
title: "Cursor: Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/relative-paths
observations:
  - value: {"resolves_from": "skill root"}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-skills
    locator: "Including scripts in skills"
    evidence: docs
open:
  - question: "Does Cursor tell the model the skill folder (for example a base directory line) when a skill loads?"
    observed: "2026-11-04"
    source: cursor-skills
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: Agent Skills"
---

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [Cursor](/harnesses/cursor.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Observations

- 2026-11-04: resolves from: skill root.[^cursor-skills]

  > Reference scripts in your `SKILL.md` using relative paths from the skill root.

## Open questions

- Does Cursor tell the model the skill folder (for example a base directory line) when a skill loads?[^cursor-skills]

[^cursor-skills]: Cursor docs: Agent Skills
