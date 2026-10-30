---
type: Harness Fact
title: "Cursor: Reads CLAUDE.md"
description: "Reads CLAUDE.md in Cursor, as observed over time."
tags: [instructions]
harness: cursor
subject: instructions/claude-md
observations:
  - value: { supported: true, scope: CLI (cursor-agent) }
    since: null
    until: null
    observed: "2026-10-01"
    source: cursor-cli
    via: skill-naming
    evidence: docs
    note: "The cursor-agent docs list rules, AGENTS.md, CLAUDE.md and mcp.json."
sources:
  - id: cursor-cli
    resource: "https://cursor.com/docs/cli/overview"
    title: "Cursor docs: CLI overview"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Reads CLAUDE.md](/subjects/instructions/claude-md.md) in
[Cursor](/harnesses/cursor.md). Whether CLAUDE.md is read, natively or as a fallback.

## Observations

- 2026-10-01: supported: `true`; scope: CLI (cursor-agent). The cursor-agent docs list rules,
  AGENTS.md, CLAUDE.md and mcp.json.[^cursor-cli][^skill-naming]

[^cursor-cli]: Cursor docs: CLI overview
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
