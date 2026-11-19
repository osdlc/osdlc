---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: plugins/manifest-validation
  object:
    schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Kiro Plugin manifest validation](../../study-results/Kiro/2026-11-05%20Kiro%20Plugin%20manifest%20validation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[Kiro docs Create powers](../../documents/kiro.dev/Kiro%20docs%20Create%20powers.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Plugin manifest validation](../../subjects/plugins/Plugin%20manifest%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What does Kiro do with an unknown or wrongly typed field in plugin.json? The docs say only that each power must have a valid plugin.json or POWER.md.
  - Does Kiro ship a validator? The docs point to the Power Builder for creating and converting powers but name no validate command.
imported_from: fact:plugins/manifest-validation@kiro#scope-[null,null,null]
---

Imported from `facts/kiro/plugins/manifest-validation.md`.

Open questions:
- What does Kiro do with an unknown or wrongly typed field in plugin.json? The docs say only that each power must have a valid plugin.json or POWER.md.
- Does Kiro ship a validator? The docs point to the Power Builder for creating and converting powers but name no validate command.
