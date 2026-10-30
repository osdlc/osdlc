---
type: Harness Fact
title: "pi: Project skill directories"
description: "Project skill directories in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/project-dirs
observations:
  - value: { dirs: [".pi/skills/", ".agents/skills/"] }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
  - value: { dirs: ["<cwd>/.pi/skills", ".agents/skills"], scope: ".agents/skills in each ancestor up to the git root" }
    since: null
    until: null
    observed: "2026-10-01"
    source: pi-repo
    via: skill-naming
    locator: "packages/coding-agent/package-manager.ts:468-487, 2452-2560 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516"
    evidence: source
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
  - id: pi-repo
    resource: "https://github.com/earendil-works/pi"
    title: earendil-works/pi source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Project skill directories](/subjects/skills/project-dirs.md) in
[pi](/harnesses/pi.md). Directories in the project the harness loads skills from.

## Observations

- 2026-08-08: dirs: `.pi/skills/`, `.agents/skills/`.[^harness-comparison]
- 2026-10-01: dirs: `<cwd>/.pi/skills`, `.agents/skills`; scope: .agents/skills in each ancestor up
  to the git root.[^pi-repo][^skill-naming]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
