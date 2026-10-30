---
type: Harness Fact
title: "Codex CLI: User invocation syntax"
description: "User invocation syntax in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/user-invocation
observations:
  - value: { syntax: "$acme-tools:review" }
    since: null
    until: null
    observed: "2026-10-01"
    source: codex-repo
    via: skill-naming
    locator: "codex-rs/skills/src/selection.rs:30 at 57ac6f5"
    evidence: source
sources:
  - id: codex-repo
    resource: "https://github.com/openai/codex"
    title: openai/codex source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [User invocation syntax](/subjects/skills/user-invocation.md) in
[Codex CLI](/harnesses/codex.md). What a user types to run a skill.

## Observations

- 2026-10-01: syntax: $acme-tools:review.[^codex-repo][^skill-naming]

[^codex-repo]: openai/codex source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
