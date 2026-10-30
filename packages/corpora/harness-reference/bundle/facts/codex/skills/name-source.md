---
type: Harness Fact
title: "Codex CLI: Skill name source"
description: "Skill name source in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/name-source
observations:
  - value: { rule: "frontmatter `name`, else the parent directory" }
    since: null
    until: null
    observed: "2026-10-01"
    source: codex-repo
    via: skill-naming
    locator: "codex-rs/skills/src/parser.rs:64-69, ext/skills/src/loader/environment.rs:385-386 at 57ac6f5"
    evidence: source
sources:
  - id: codex-repo
    resource: "https://github.com/openai/codex"
    title: openai/codex source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Skill name source](/subjects/skills/name-source.md) in
[Codex CLI](/harnesses/codex.md). Where the skill's runtime name comes from (frontmatter `name`,
directory, or both).

## Observations

- 2026-10-01: rule: frontmatter `name`, else the parent directory.[^codex-repo][^skill-naming]

[^codex-repo]: openai/codex source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
