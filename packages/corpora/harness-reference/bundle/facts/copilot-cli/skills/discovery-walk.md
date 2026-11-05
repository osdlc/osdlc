---
type: Harness Fact
title: "Copilot CLI: Skill discovery walk"
description: "Skill discovery walk in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/discovery-walk
observations:
  - value: {"locations": ["<project>/.github/skills/", "<project>/.agents/skills/", "<project>/.claude/skills/", "parent .github/skills/ (monorepo)", "~/.copilot/skills/", "~/.agents/skills/"], "extra_dirs": "COPILOT_SKILLS_DIRS, comma-separated"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-command-reference
    locator: "Skill locations table"
    evidence: docs
    note: "Table row paraphrased by the fetch tool. Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"exclusion": "ignoredSkillsLocations setting excludes directories and their descendants"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-command-reference
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"layout": "each skill in a subdirectory containing SKILL.md"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-config-dir-reference
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Are symlinked skill folders followed?"
    observed: "2026-11-04"
    source: copilot-cli-add-skills
  - question: "Do parent-directory walks include .agents/skills and .claude/skills, or only .github/skills?"
    observed: "2026-11-04"
    source: copilot-cli-add-skills
sources:
  - id: copilot-cli-command-reference
    resource: "https://docs.github.com/en/copilot/reference/cli-command-reference"
    title: "Copilot docs: CLI command reference"
  - id: copilot-cli-config-dir-reference
    resource: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference"
    title: "Copilot docs: CLI config directory reference"
  - id: copilot-cli-add-skills
    resource: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills"
    title: "Copilot docs: add skills to Copilot CLI"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Copilot CLI](/harnesses/copilot-cli.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: locations: <project>/.github/skills/, <project>/.agents/skills/, <project>/.claude/skills/, parent .github/skills/ (monorepo), ~/.copilot/skills/, ~/.agents/skills/; extra dirs: COPILOT_SKILLS_DIRS, comma-separated. Table row paraphrased by the fetch tool. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-command-reference]

  > Parent .github/skills/ | Inherited | Monorepo parent directory support.
- 2026-11-04: exclusion: ignoredSkillsLocations setting excludes directories and their descendants. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-command-reference]

  > Use the ignoredSkillsLocations setting to exclude specific directories (and their descendants) from discovery
- 2026-11-04: layout: each skill in a subdirectory containing SKILL.md. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-config-dir-reference]

  > Each skill lives in a subdirectory containing a SKILL.md file

## Open questions

- Are symlinked skill folders followed?[^copilot-cli-add-skills]
- Do parent-directory walks include .agents/skills and .claude/skills, or only .github/skills?[^copilot-cli-add-skills]

[^copilot-cli-command-reference]: Copilot docs: CLI command reference
[^copilot-cli-config-dir-reference]: Copilot docs: CLI config directory reference
[^copilot-cli-add-skills]: Copilot docs: add skills to Copilot CLI
