---
kind: source
reportedIn:
  - "[Pi README](../../documents/Earendil%20Inc/Pi%20README.md)"
  - "[What is a plugin skill called in each harness](../../documents/skillwright/What%20is%20a%20plugin%20skill%20called%20in%20each%20harness.md)"
harness: "[Pi](../../harnesses/Pi.md)"
observed: 2026-10-01
locator: packages/coding-agent/src/core/skills.ts:92-111, 325-331 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
imported_from: fact:skills/name-validation@pi#observation-1
---

Imported from `facts/pi/skills/name-validation.md`, observation 1.

- checks: "length up to 64, ^[a-z0-9-]+$, no edge or double hyphens"
- blocking: false
- must_match_directory: false
- rejects_only: "a missing description"

Failures are warnings; the skill loads anyway.
