---
proposition:
  subject: '[Conan](../../stores/Conan.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: conan list "*"
      shows: recipes, revisions and packages in the local cache
    - command: conan cache path REF
      shows: the cache folder of a given reference
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Conan inventory command 1](../../study-results/Conan/2026-11-21%20Conan%20inventory%20command%201.md)'
  - '[2026-11-21 Conan inventory command 2](../../study-results/Conan/2026-11-21%20Conan%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The list and cache references describe these; neither documents sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Conan](../../stores/Conan.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The list and cache references describe these; neither documents sizes.
