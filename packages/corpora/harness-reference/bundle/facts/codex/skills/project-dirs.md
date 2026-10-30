---
type: Harness Fact
title: "Codex CLI: Project skill directories"
description: "Project skill directories in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/project-dirs
observations:
  - value: { dirs: [".agents/skills/"] }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
  - value: { dirs: [".codex/skills", ".agents/skills"], scope: each ancestor of the working directory }
    since: null
    until: null
    observed: "2026-10-01"
    source: codex-repo
    via: skill-naming
    locator: codex-rs/ext/skills/src/host_roots.rs at 57ac6f51639f7cad705a48ac4bd8073034a2f150
    evidence: source
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
  - id: codex-repo
    resource: "https://github.com/openai/codex"
    title: openai/codex source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Project skill directories](/subjects/skills/project-dirs.md) in
[Codex CLI](/harnesses/codex.md). Directories in the project the harness loads skills from.

## Observations

- 2026-08-08: dirs: `.agents/skills/`.[^harness-comparison]
- 2026-10-01: dirs: `.codex/skills`, `.agents/skills`; scope: each ancestor of the working
  directory.[^codex-repo][^skill-naming]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
[^codex-repo]: openai/codex source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
