---
type: Harness Fact
title: "pi: Skill discovery walk"
description: "Skill discovery walk in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/discovery-walk
observations:
  - value: {"recursive": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-skills
    locator: "Add it to Pi"
    evidence: docs
  - value: {"agents_skills_walk": "working directory through ancestors, stopping at the repository root when one exists"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-skills
    locator: "Add it to Pi"
    evidence: docs
open:
  - question: "Are symlinked skill folders followed during discovery? Only package manifest globs are documented (symlinked resource roots must be listed directly)."
    observed: "2026-11-04"
    source: pi-skills
sources:
  - id: pi-skills
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/skills.md"
    title: "Pi docs: Skills (main at d57c2d2)"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [pi](/harnesses/pi.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: recursive: yes.[^pi-skills]

  > Directories containing `SKILL.md` are discovered recursively.
- 2026-11-04: agents skills walk: working directory through ancestors, stopping at the repository root when one exists.[^pi-skills]

  > Project `.agents/skills/` directories are discovered from the working directory through its ancestors, stopping at the repository root when one exists.

## Open questions

- Are symlinked skill folders followed during discovery? Only package manifest globs are documented (symlinked resource roots must be listed directly).[^pi-skills]

[^pi-skills]: Pi docs: Skills (main at d57c2d2)
