---
type: Harness Fact
title: "Claude Code: Reads AGENTS.md"
description: "Reads AGENTS.md in Claude Code, as observed over time."
tags: [instructions]
harness: claude-code
subject: instructions/agents-md
observations:
  - value: { supported: false, workaround: "import it with an `@AGENTS.md` line in CLAUDE.md" }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Reads AGENTS.md](/subjects/instructions/agents-md.md) in
[Claude Code](/harnesses/claude-code.md). Whether AGENTS.md is read natively, without an import
line.

## Observations

- 2026-08-08: supported: `false`; workaround: import it with an `@AGENTS.md` line in
  CLAUDE.md.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
