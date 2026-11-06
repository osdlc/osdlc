---
type: Harness Fact
title: "OpenCode: Files beside SKILL.md"
description: "Files beside SKILL.md in OpenCode, as observed over time."
tags: [skills]
harness: opencode
subject: skills/bundled-files
observations:
  - value: {"contents_autoloaded": false, "file_names_listed": "up to 10, sampled"}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-src-skill
    locator: "packages/core/src/skill.ts:40-57 and 76-89 at 8f3f7b7 (dev branch)"
    evidence: source
    note: "Loading a skill lists up to 10 bundled file paths; the code shown does not read their contents."
sources:
  - id: opencode-src-skill
    resource: "https://github.com/anomalyco/opencode/blob/8f3f7b74c982fc144b147d524d0a70d671187a3b/packages/core/src/skill.ts"
    title: "OpenCode source: core/src/skill.ts (dev at 8f3f7b7)"
---

What the sources say about [Files beside SKILL.md](/subjects/skills/bundled-files.md) in [OpenCode](/harnesses/opencode.md).
Whether files beside SKILL.md (scripts, references, assets) load into context without being asked for.

## Observations

- 2026-11-04: contents autoloaded: no; file names listed: up to 10, sampled. Loading a skill lists up to 10 bundled file paths; the code shown does not read their contents.[^opencode-src-skill]

  > Note: file list is sampled.

[^opencode-src-skill]: OpenCode source: core/src/skill.ts (dev at 8f3f7b7)
