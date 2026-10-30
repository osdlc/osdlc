---
type: Harness Fact
title: "Cursor: User skill directories"
description: "User skill directories in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/user-dirs
observations:
  - value: { dirs: ["~/.agents/skills", "~/.cursor/skills"] }
    since: null
    until: null
    observed: "2026-10-01"
    source: cursor-skills
    via: skill-naming
    evidence: docs
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: skills"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [User skill directories](/subjects/skills/user-dirs.md) in
[Cursor](/harnesses/cursor.md). Directories in the home directory the harness loads skills from.

## Observations

- 2026-10-01: dirs: `~/.agents/skills`, `~/.cursor/skills`.[^cursor-skills][^skill-naming]

[^cursor-skills]: Cursor docs: skills
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
