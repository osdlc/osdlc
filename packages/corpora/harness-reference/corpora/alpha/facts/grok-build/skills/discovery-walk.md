---
type: Harness Fact
title: "Grok Build: Skill discovery walk"
description: "Skill discovery walk in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/discovery-walk
observations:
  - value: {"parents": "walks every directory between the working directory and the repo root", "agents_dir": ".agents/skills scanned at each tier", "gitignore": "not used", "custom_dirs": "[skills] paths walked recursively"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-skills
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md:29 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
open:
  - question: "Are symlinked skill folders followed?"
    observed: "2026-11-04"
    source: grok-build-skills
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Grok Build](/harnesses/grok-build.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: parents: walks every directory between the working directory and the repo root; agents dir: .agents/skills scanned at each tier; gitignore: not used; custom dirs: [skills] paths walked recursively.[^grok-build-skills]

  > Grok also scans `.agents/skills/` (and `commands/`) at each tier (alongside `.grok/`) and walks every directory between your working directory and the repo root.

## Open questions

- Are symlinked skill folders followed?[^grok-build-skills]

[^grok-build-skills]: Grok Build user guide: Skills
