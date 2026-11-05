---
type: Harness Fact
title: "Claude Code: Skill body size"
description: "Skill body size in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/body-size
observations:
  - value: {"recommendation": "SKILL.md under 500 lines; move reference material to separate files"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Add supporting files"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"after_compaction": "Claude Code can keep only the start of an invoked skill"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Troubleshooting, Claude stops following a skill"
    evidence: docs
open:
  - question: "Is there a hard byte or token limit on a SKILL.md body, and how much of an invoked skill survives compaction?"
    observed: "2026-11-04"
    source: claude-code-skills
sources:
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
---

What the sources say about [Skill body size](/subjects/skills/body-size.md) in [Claude Code](/harnesses/claude-code.md).
Limits or guidance on the SKILL.md body size, and what happens past them.

## Observations

- 2026-11-04: recommendation: SKILL.md under 500 lines; move reference material to separate files. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > Keep SKILL.md under 500 lines. Move detailed reference material to separate files.
- 2026-11-04: after compaction: Claude Code can keep only the start of an invoked skill.[^claude-code-skills]

  > After compaction, Claude Code can keep only the start of an invoked skill, so put the most important instructions near the top of SKILL.md.

## Open questions

- Is there a hard byte or token limit on a SKILL.md body, and how much of an invoked skill survives compaction?[^claude-code-skills]

[^claude-code-skills]: Claude Code docs: skills
