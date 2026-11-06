---
type: Harness Fact
title: "OpenCode: Skill discovery walk"
description: "Skill discovery walk in OpenCode, as observed over time."
tags: [skills]
harness: opencode
subject: skills/discovery-walk
observations:
  - value: {"walk_up": "from the working directory to the git worktree", "locations": [".opencode/skills", ".claude/skills", ".agents/skills"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-skills
    locator: "Understand discovery"
    evidence: docs
  - value: {"symlinks": "followed (target type resolved with stat)", "max_depth": "6 below the root"}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-src-skill-scan
    locator: "packages/core/src/config/plugin/skill-scan.ts:7,21-27 at 8f3f7b7 (dev branch)"
    evidence: source
    note: "Not confirmed to be the scan used by the released build."
sources:
  - id: opencode-skills
    resource: "https://opencode.ai/docs/skills"
    title: "OpenCode docs: Agent Skills"
  - id: opencode-src-skill-scan
    resource: "https://github.com/anomalyco/opencode/blob/8f3f7b74c982fc144b147d524d0a70d671187a3b/packages/core/src/config/plugin/skill-scan.ts"
    title: "OpenCode source: skill-scan.ts (dev at 8f3f7b7)"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [OpenCode](/harnesses/opencode.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: walk up: from the working directory to the git worktree; locations: .opencode/skills, .claude/skills, .agents/skills.[^opencode-skills]

  > For project-local paths, OpenCode walks up from your current working directory until it reaches the git worktree.
- 2026-11-04: symlinks: followed (target type resolved with stat); max depth: 6 below the root. Not confirmed to be the scan used by the released build.[^opencode-src-skill-scan]

  > if (entry.type !== "SymbolicLink") return Effect.succeed({ name: entry.name, path: target, type: entry.type })

[^opencode-skills]: OpenCode docs: Agent Skills
[^opencode-src-skill-scan]: OpenCode source: skill-scan.ts (dev at 8f3f7b7)
