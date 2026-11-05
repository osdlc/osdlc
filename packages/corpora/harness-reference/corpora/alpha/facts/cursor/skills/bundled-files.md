---
type: Harness Fact
title: "Cursor: Files beside SKILL.md"
description: "Files beside SKILL.md in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/bundled-files
observations:
  - value: {"references_dir": "loaded on demand", "autoloaded": false}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-skills
    locator: "Optional directories table, references/ row"
    evidence: docs
open:
  - question: "Are scripts and assets beside SKILL.md ever placed in context without the agent asking for them?"
    observed: "2026-11-04"
    source: cursor-skills
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: Agent Skills"
---

What the sources say about [Files beside SKILL.md](/subjects/skills/bundled-files.md) in [Cursor](/harnesses/cursor.md).
Whether files beside SKILL.md (scripts, references, assets) load into context without being asked for.

## Observations

- 2026-11-04: references dir: loaded on demand; autoloaded: no.[^cursor-skills]

  > Additional documentation loaded on demand

## Open questions

- Are scripts and assets beside SKILL.md ever placed in context without the agent asking for them?[^cursor-skills]

[^cursor-skills]: Cursor docs: Agent Skills
