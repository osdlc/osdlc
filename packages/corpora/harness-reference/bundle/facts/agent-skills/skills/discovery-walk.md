---
type: Harness Fact
title: "Agent Skills (agentskills.io): Skill discovery walk"
description: "Skill discovery walk in Agent Skills (agentskills.io), as observed over time."
tags: [skills]
harness: agent-skills
subject: skills/discovery-walk
observations:
  - value: {"scope_paths": ["<project>/.agents/skills/", "~/.agents/skills/", "client-specific directories"], "ancestor_dirs": "some implementations scan ancestor directories up to the git root", "scan_bounds": "max depth 4-6 levels, max 2000 directories suggested"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-client-guide
    locator: "Step 1, Where to scan"
    evidence: docs
    note: "Implementer guide; the spec does not mandate where skill directories live."
open:
  - question: "Does the standard say anything about symlinked skill folders?"
    observed: "2026-11-04"
    source: agentskills-specification
sources:
  - id: agentskills-client-guide
    resource: "https://agentskills.io/client-implementation/adding-skills-support"
    title: "Agent Skills: how to add skills support to your agent"
  - id: agentskills-specification
    resource: "https://agentskills.io/specification"
    title: "Agent Skills specification"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Agent Skills (agentskills.io)](/harnesses/agent-skills.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: scope paths: <project>/.agents/skills/, ~/.agents/skills/, client-specific directories; ancestor dirs: some implementations scan ancestor directories up to the git root; scan bounds: max depth 4-6 levels, max 2000 directories suggested. Implementer guide; the spec does not mandate where skill directories live.[^agentskills-client-guide]

  > Other additional locations include ancestor directories up to the git root (useful for monorepos)

## Open questions

- Does the standard say anything about symlinked skill folders?[^agentskills-specification]

[^agentskills-client-guide]: Agent Skills: how to add skills support to your agent
[^agentskills-specification]: Agent Skills specification
