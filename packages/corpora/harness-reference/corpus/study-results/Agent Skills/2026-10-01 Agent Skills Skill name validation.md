---
kind: docs
reportedIn:
  - "[Agent Skills specification](../../documents/agentskills.io/Agent%20Skills%20specification.md)"
  - "[What is a plugin skill called in each harness](../../documents/skillwright/What%20is%20a%20plugin%20skill%20called%20in%20each%20harness.md)"
harness: "[Agent Skills](../../harnesses/Agent%20Skills.md)"
observed: 2026-10-01
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
imported_from: fact:skills/name-validation@agent-skills#observation-1
---

Imported from `facts/agent-skills/skills/name-validation.md`, observation 1.

- length: "1-64"
- charset: "lowercase a-z, 0-9 and hyphens"
- edges: "no leading or trailing hyphen"
- consecutive_hyphens: false
- colon_allowed: false
- must_match_directory: true
