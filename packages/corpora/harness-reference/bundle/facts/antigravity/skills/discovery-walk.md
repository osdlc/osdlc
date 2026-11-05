---
type: Harness Fact
title: "Antigravity CLI: Skill discovery walk"
description: "Skill discovery walk in Antigravity CLI, as observed over time."
tags: [skills]
harness: antigravity
subject: skills/discovery-walk
observations:
  - value: {"parent_directories": "read up to the repository root", "cli_extra_dirs": ["~/.gemini/antigravity-cli/skills", "~/.gemini/skills"], "workspace_dir": ".agents/skills (.agent/skills still supported)"}
    since: null
    until: null
    observed: "2026-11-04"
    source: antigravity-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Are nested directories below the working directory scanned, and are symlinked skill folders followed?"
    observed: "2026-11-04"
    source: antigravity-skills
sources:
  - id: antigravity-skills
    resource: "https://antigravity.google/docs/skills"
    title: "Antigravity docs: Agent skills"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Antigravity CLI](/harnesses/antigravity.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: parent directories: read up to the repository root; cli extra dirs: ~/.gemini/antigravity-cli/skills, ~/.gemini/skills; workspace dir: .agents/skills (.agent/skills still supported). Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^antigravity-skills]

  > Antigravity also reads `.agents/skills/` in each parent folder up to the repository root.

## Open questions

- Are nested directories below the working directory scanned, and are symlinked skill folders followed?[^antigravity-skills]

[^antigravity-skills]: Antigravity docs: Agent skills
