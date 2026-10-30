---
type: Harness Fact
title: "Cursor: Project skill directories"
description: "Project skill directories in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/project-dirs
observations:
  - value: { dirs: [".cursor/skills/", ".agents/", ".claude/", ".codex/"] }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
  - value: { dirs: [".agents/skills", ".cursor/skills"], legacy: [".claude/skills", ".codex/skills"], nested: true }
    since: null
    until: null
    observed: "2026-10-01"
    source: cursor-skills
    via: skill-naming
    evidence: docs
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: skills"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Project skill directories](/subjects/skills/project-dirs.md) in
[Cursor](/harnesses/cursor.md). Directories in the project the harness loads skills from.

## Observations

- 2026-08-08: dirs: `.cursor/skills/`, `.agents/`, `.claude/`, `.codex/`.[^harness-comparison]
- 2026-10-01: dirs: `.agents/skills`, `.cursor/skills`; legacy: `.claude/skills`, `.codex/skills`;
  nested: `true`.[^cursor-skills][^skill-naming]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
[^cursor-skills]: Cursor docs: skills
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
