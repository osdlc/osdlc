---
type: Harness Fact
title: "Qwen Code: Skill discovery walk"
description: "Skill discovery walk in Qwen Code, as observed over time."
tags: [skills]
harness: qwen-code
subject: skills/discovery-walk
observations:
  - value: {"symlinks": "followed, target can be anywhere", "custom_dirs_nested": "a skill nested deeper than the custom directory is not found"}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"project_dirs": [".qwen/skills", ".agents/skills"], "personal_dirs": ["~/.qwen/skills", "~/.agents/skills"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does discovery walk parent directories of the working directory up to a repo root?"
    observed: "2026-11-04"
    source: qwen-code-skills
sources:
  - id: qwen-code-skills
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/"
    title: "Qwen Code docs: Skills"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Qwen Code](/harnesses/qwen-code.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: symlinks: followed, target can be anywhere; custom dirs nested: a skill nested deeper than the custom directory is not found. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-skills]

  > Symlinked Skill folders are followed, and their target can live anywhere on disk.
- 2026-11-04: project dirs: .qwen/skills, .agents/skills; personal dirs: ~/.qwen/skills, ~/.agents/skills. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-skills]

  > Project: `.qwen/skills/` and `.agents/skills/`

## Open questions

- Does discovery walk parent directories of the working directory up to a repo root?[^qwen-code-skills]

[^qwen-code-skills]: Qwen Code docs: Skills
