---
type: Harness Fact
title: "Codex CLI: Skill discovery walk"
description: "Skill discovery walk in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/discovery-walk
observations:
  - value: {"parent_dirs": "yes, from current working directory up to the repository root", "locations": ["$CWD/.agents/skills", "$CWD/../.agents/skills", "$REPO_ROOT/.agents/skills", "$HOME/.agents/skills", "/etc/codex/skills", "bundled system skills"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-skills
    locator: "Where skills are discovered"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"symlinks": "supported; target followed when scanning"}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-skills
    locator: "Where skills are discovered"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does Codex scan nested .agents/skills directories below the working directory in a monorepo?"
    observed: "2026-11-04"
    source: codex-skills
sources:
  - id: codex-skills
    resource: "https://learn.chatgpt.com/docs/build-skills"
    title: "Codex docs: build skills (redirect target of developers.openai.com/codex/skills)"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Codex CLI](/harnesses/codex.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: parent dirs: yes, from current working directory up to the repository root; locations: $CWD/.agents/skills, $CWD/../.agents/skills, $REPO_ROOT/.agents/skills, $HOME/.agents/skills, /etc/codex/skills, bundled system skills. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-skills]

  > in every directory from your current working directory up to the repository root.
- 2026-11-04: symlinks: supported; target followed when scanning. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-skills]

  > Codex supports symlinked skill folders and follows the symlink target when scanning these locations.

## Open questions

- Does Codex scan nested .agents/skills directories below the working directory in a monorepo?[^codex-skills]

[^codex-skills]: Codex docs: build skills (redirect target of developers.openai.com/codex/skills)
