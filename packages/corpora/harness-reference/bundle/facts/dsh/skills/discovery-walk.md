---
type: Harness Fact
title: "DeepSeek Harness (dsh): Skill discovery walk"
description: "Skill discovery walk in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/discovery-walk
observations:
  - value: {"project_root": "nearest ancestor containing .git, else the cwd", "depth": "one level: <root>/<name>/SKILL.md or <root>/<name>.md; nested trees ignored", "symlinks": "symlinked directories are discovered and their paths retained"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-skill-filesystem
    locator: "packages/skill/skill-filesystem/README.md:56 at fcc0ad46"
    evidence: source
  - value: {"nested_skill_files": "not discovered"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-skill-filesystem
    locator: "packages/skill/skill-filesystem/README.md:36 at fcc0ad46"
    evidence: source
sources:
  - id: dsh-skill-filesystem
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/skill-filesystem/README.md"
    title: "dsh skill-filesystem package README"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: project root: nearest ancestor containing .git, else the cwd; depth: one level: <root>/<name>/SKILL.md or <root>/<name>.md; nested trees ignored; symlinks: symlinked directories are discovered and their paths retained.[^dsh-skill-filesystem]

  > The project root is the nearest ancestor containing `.git`; without one, the current cwd is used.
- 2026-11-04: nested skill files: not discovered.[^dsh-skill-filesystem]

  > nested `**/SKILL.md` files are deliberately not discovered.

[^dsh-skill-filesystem]: dsh skill-filesystem package README
