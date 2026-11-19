---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: plugins/marketplace
  object:
    supported: true
    bundles: skills, agents, MCP, hooks, rules
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Cursor Marketplace](../../study-results/Cursor/2026-08-08%20Cursor%20Marketplace.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help plugin marketplace](../../study-results/Cursor/2026-11-09%20Cursor%20help%20plugin%20marketplace.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The CLI adds git marketplaces.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-08-08T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Marketplace](../../subjects/plugins/Marketplace.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/marketplace@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/plugins/marketplace.md`.

Rechecked 2026-11-09 against the installed CLI and vendor docs.
