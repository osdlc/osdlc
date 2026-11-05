---
type: Harness Fact
title: "Cursor: Skill discovery walk"
description: "Skill discovery walk in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/discovery-walk
observations:
  - value: {"nested_subdirectories": true, "scoped_to": "files under the directory holding the .cursor/skills folder"}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-skills
    locator: "Nested skill directories"
    evidence: docs
  - value: {"recursive_within_root": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-skills
    locator: "Nested skill directories"
    evidence: docs
open:
  - question: "Are skill folders in parent directories above the working directory found, and are symlinked skill folders followed?"
    observed: "2026-11-04"
    source: cursor-skills
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: Agent Skills"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Cursor](/harnesses/cursor.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: nested subdirectories: yes; scoped to: files under the directory holding the .cursor/skills folder.[^cursor-skills]

  > A `.cursor/skills/` (or `.agents/skills/`) folder anywhere inside your repository is picked up, so monorepos can colocate skills with the package they apply to
- 2026-11-04: recursive within root: yes.[^cursor-skills]

  > Cursor walks the skills root recursively and picks up any `SKILL.md` it finds

## Open questions

- Are skill folders in parent directories above the working directory found, and are symlinked skill folders followed?[^cursor-skills]

[^cursor-skills]: Cursor docs: Agent Skills
