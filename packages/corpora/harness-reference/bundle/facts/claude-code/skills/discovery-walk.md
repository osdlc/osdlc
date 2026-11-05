---
type: Harness Fact
title: "Claude Code: Skill discovery walk"
description: "Skill discovery walk in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/discovery-walk
observations:
  - value: {"parent_dirs": "yes, from the start directory up to the repository root", "nested_dirs": "not loaded at startup; load the first time Claude reads or edits a file in that subdirectory"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Load skills in monorepos and subdirectories"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"symlinks": "supported; target read once even if several links point at it"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Choose where skills load"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"add_dir": "loads that directory's .claude/skills, .claude/commands and .claude/agents"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Load skills from a directory outside the project"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"plugins_in_skills_dir": "parent directories are not searched for plugins"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-plugin-loading
    locator: "Check why a repository plugin didn't load"
    evidence: docs
sources:
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
  - id: claude-code-plugin-loading
    resource: "https://code.claude.com/docs/en/plugins/loading.md"
    title: "Claude Code docs: plugin loading reference"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Claude Code](/harnesses/claude-code.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: parent dirs: yes, from the start directory up to the repository root; nested dirs: not loaded at startup; load the first time Claude reads or edits a file in that subdirectory. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > Claude Code loads project skills from .claude/skills/ in the directory where you start it and in every parent directory up to the repository root

  > Skills in a .claude/skills/ directory below where you started don't load at startup. They load the first time Claude reads or edits a file in that subdirectory and stay available for the rest of the session.
- 2026-11-04: symlinks: supported; target read once even if several links point at it. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > a <skill-name> entry in the enterprise, personal, or project location can be a symlink to a directory elsewhere on disk. Claude Code reads SKILL.md from the target and loads the skill once even if several locations point at the same target.
- 2026-11-04: add dir: loads that directory's .claude/skills, .claude/commands and .claude/agents. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > When you add a directory with --add-dir or /add-dir, Claude Code loads the skills in that directory's .claude/skills/, along with its .claude/commands/ and .claude/agents/.
- 2026-11-04: plugins in skills dir: parent directories are not searched for plugins.[^claude-code-plugin-loading]

  > unlike plain skills and commands, doesn't search parent directories for plugins. Launch from the repository root instead

[^claude-code-skills]: Claude Code docs: skills
[^claude-code-plugin-loading]: Claude Code docs: plugin loading reference
