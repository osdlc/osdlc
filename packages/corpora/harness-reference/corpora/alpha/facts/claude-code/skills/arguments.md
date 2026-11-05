---
type: Harness Fact
title: "Claude Code: Skill arguments"
description: "Skill arguments in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/arguments
observations:
  - value: {"placeholder": "$ARGUMENTS", "fallback": "appends 'ARGUMENTS: <input>' to the skill content when no placeholder receives it", "indexed_arguments": "yes, shell-style quoting"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Pass arguments to skills"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
---

What the sources say about [Skill arguments](/subjects/skills/arguments.md) in [Claude Code](/harnesses/claude-code.md).
How text typed after a skill invocation reaches the skill.

## Observations

- 2026-11-04: placeholder: $ARGUMENTS; fallback: appends 'ARGUMENTS: <input>' to the skill content when no placeholder receives it; indexed arguments: yes, shell-style quoting. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > If you invoke a skill with arguments but no placeholder in the skill's content receives one, Claude Code appends ARGUMENTS: <your input> to the end of the skill content so Claude still sees what you typed.

[^claude-code-skills]: Claude Code docs: skills
