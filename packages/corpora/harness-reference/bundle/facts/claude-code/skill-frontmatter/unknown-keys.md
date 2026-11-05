---
type: Harness Fact
title: "Claude Code: Unknown frontmatter keys"
description: "Unknown frontmatter keys in Claude Code, as observed over time."
tags: [skill-frontmatter]
harness: claude-code
subject: skill-frontmatter/unknown-keys
observations:
  - value: {"behavior": "ignored without an error"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Frontmatter reference"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [Claude Code](/harnesses/claude-code.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Observations

- 2026-11-04: behavior: ignored without an error. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > Claude Code ignores a field it doesn't recognize without reporting an error.

[^claude-code-skills]: Claude Code docs: skills
