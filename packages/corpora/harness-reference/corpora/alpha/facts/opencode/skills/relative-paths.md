---
type: Harness Fact
title: "OpenCode: Relative paths in SKILL.md"
description: "Relative paths in SKILL.md in OpenCode, as observed over time."
tags: [skills]
harness: opencode
subject: skills/relative-paths
observations:
  - value: {"resolves_from": "skill base directory", "model_told_location": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-src-skill
    locator: "packages/core/src/skill.ts:40-57 at 8f3f7b7 (dev branch)"
    evidence: source
sources:
  - id: opencode-src-skill
    resource: "https://github.com/anomalyco/opencode/blob/8f3f7b74c982fc144b147d524d0a70d671187a3b/packages/core/src/skill.ts"
    title: "OpenCode source: core/src/skill.ts (dev at 8f3f7b7)"
---

What the sources say about [Relative paths in SKILL.md](/subjects/skills/relative-paths.md) in [OpenCode](/harnesses/opencode.md).
What folder a relative path in SKILL.md resolves from, whether the harness tells the model that folder, and whether the model follows it.

## Observations

- 2026-11-04: resolves from: skill base directory; model told location: yes.[^opencode-src-skill]

  > Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.

[^opencode-src-skill]: OpenCode source: core/src/skill.ts (dev at 8f3f7b7)
