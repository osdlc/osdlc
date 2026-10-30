---
type: Harness Fact
title: "Claude Code: Pre-qualified skill name"
description: "Pre-qualified skill name in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/prequalified-name
observations:
  - value: { behaviour: prefix doubled in the slash menu, example: "/plugin:plugin:skill" }
    since: null
    until: "2.1.246"
    observed: "2026-10-01"
    source: claude-changelog
    via: skill-naming
    evidence: changelog
    note: Read back from the 2.1.246 fix entry. 2.1.216 separately fixed such skills losing the prefix in autocomplete.
  - value: { behaviour: "shown once, not doubled" }
    since: "2.1.246"
    until: null
    observed: "2026-10-01"
    source: claude-changelog
    via: skill-naming
    evidence: changelog
sources:
  - id: claude-changelog
    resource: "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md"
    title: Claude Code CHANGELOG
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Pre-qualified skill name](/subjects/skills/prequalified-name.md) in
[Claude Code](/harnesses/claude-code.md). What happens when a plugin skill's frontmatter `name`
already carries the `<plugin>:` prefix.

## Observations

- 2026-10-01 (until 2.1.246): behaviour: prefix doubled in the slash menu; example:
  /plugin:plugin:skill. Read back from the 2.1.246 fix entry. 2.1.216 separately fixed such skills
  losing the prefix in autocomplete.[^claude-changelog][^skill-naming]
- 2026-10-01 (from 2.1.246): behaviour: shown once, not doubled.[^claude-changelog][^skill-naming]

[^claude-changelog]: Claude Code CHANGELOG
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
