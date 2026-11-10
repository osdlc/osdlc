---
kind: source
reportedIn:
  - "[Pi README](../../documents/Earendil%20Inc/Pi%20README.md)"
  - "[What is a plugin skill called in each harness](../../documents/skillwright/What%20is%20a%20plugin%20skill%20called%20in%20each%20harness.md)"
harness: "[Pi](../../harnesses/Pi.md)"
observed: 2026-10-01
locator: packages/coding-agent/src/core/skills.ts:432-447 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
imported_from: fact:skills/duplicate-names@pi#observation-1
---

Imported from `facts/pi/skills/duplicate-names.md`, observation 1.

- rule: "first found wins, with a collision diagnostic naming both paths"
- order: "user skills before project skills"
