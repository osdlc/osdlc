---
type: Harness Fact
title: "Cursor: User invocation syntax"
description: "User invocation syntax in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/user-invocation
observations:
  - value: { syntax: "/review", also: pick it from the / menu }
    since: null
    until: null
    observed: "2026-10-01"
    source: cursor-skills
    via: skill-naming
    evidence: docs
    note: "`/review` itself is a Cursor built-in (Bugbot), so the example name collides."
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: skills"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [User invocation syntax](/subjects/skills/user-invocation.md) in
[Cursor](/harnesses/cursor.md). What a user types to run a skill.

## Observations

- 2026-10-01: syntax: /review; also: pick it from the / menu. `/review` itself is a Cursor built-in
  (Bugbot), so the example name collides.[^cursor-skills][^skill-naming]

[^cursor-skills]: Cursor docs: skills
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
