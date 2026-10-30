---
type: Harness Fact
title: "pi: User invocation syntax"
description: "User invocation syntax in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/user-invocation
observations:
  - value: { syntax: "/skill:review", effect: "replaces the input with a <skill> block holding the body" }
    since: null
    until: null
    observed: "2026-10-01"
    source: pi-repo
    via: skill-naming
    locator: "packages/coding-agent/src/core/agent-session.ts:2100-2114, 3330 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516"
    evidence: source
sources:
  - id: pi-repo
    resource: "https://github.com/earendil-works/pi"
    title: earendil-works/pi source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [User invocation syntax](/subjects/skills/user-invocation.md) in
[pi](/harnesses/pi.md). What a user types to run a skill.

## Observations

- 2026-10-01: syntax: /skill:review; effect: replaces the input with a <skill> block holding the
  body.[^pi-repo][^skill-naming]

[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
