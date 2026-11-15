---
kind: source
reportedIn:
  - "[Pi README](../../documents/Earendil%20Inc/Pi%20README.md)"
  - "[What is a plugin skill called in each harness](../../documents/skillwright/What%20is%20a%20plugin%20skill%20called%20in%20each%20harness.md)"
harness: "[Pi](../../harnesses/Pi.md)"
observed: 2026-10-01
locator: packages/coding-agent/src/core/skills.ts:365, agent-session.ts:2113 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
imported_from: fact:skills/agent-loading@pi#observation-1
---

Imported from `facts/pi/skills/agent-loading.md`, observation 1.

- mechanism: "the model reads SKILL.md with the read tool when the task matches"
- base_dir: "given to the model, so relative scripts/ paths resolve"
