---
type: Harness Fact
title: "Codex CLI: Pre-qualified skill name"
description: "Pre-qualified skill name in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/prequalified-name
observations:
  - value: { behaviour: "prefix doubled (`acme-tools:acme-tools:review`)" }
    since: null
    until: null
    observed: "2026-10-01"
    source: codex-repo
    via: skill-naming
    locator: "codex-rs/ext/skills/src/loader/environment.rs:259 at 57ac6f5"
    evidence: inferred
    note: "Inferred from code that never strips an existing prefix; not observed in a run."
sources:
  - id: codex-repo
    resource: "https://github.com/openai/codex"
    title: openai/codex source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Pre-qualified skill name](/subjects/skills/prequalified-name.md) in
[Codex CLI](/harnesses/codex.md). What happens when a plugin skill's frontmatter `name` already
carries the `<plugin>:` prefix.

## Observations

- 2026-10-01: behaviour: prefix doubled (`acme-tools:acme-tools:review`). Inferred from code that
  never strips an existing prefix; not observed in a run.[^codex-repo][^skill-naming]

[^codex-repo]: openai/codex source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
