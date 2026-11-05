---
type: Harness Fact
title: "Claude Code: Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/relative-paths
observations:
  - value: {"variable": "${CLAUDE_SKILL_DIR}", "resolves_to": "directory containing the skill's SKILL.md; for plugin skills the skill's subdirectory, not the plugin root"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Available string substitutions"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "What folder does a bare relative path in a SKILL.md body (for example scripts/x.py) resolve from, and does Claude Code tell the model the skill's base directory when the skill loads?"
    observed: "2026-11-04"
    source: claude-code-skills
sources:
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
---

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [Claude Code](/harnesses/claude-code.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Observations

- 2026-11-04: variable: ${CLAUDE_SKILL_DIR}; resolves to: directory containing the skill's SKILL.md; for plugin skills the skill's subdirectory, not the plugin root. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > The directory containing the skill's SKILL.md file. For plugin skills, this is the skill's subdirectory within the plugin, not the plugin root.

## Open questions

- What folder does a bare relative path in a SKILL.md body (for example scripts/x.py) resolve from, and does Claude Code tell the model the skill's base directory when the skill loads?[^claude-code-skills]

[^claude-code-skills]: Claude Code docs: skills
