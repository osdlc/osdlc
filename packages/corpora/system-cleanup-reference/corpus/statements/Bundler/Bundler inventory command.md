---
proposition:
  subject: '[Bundler](../../stores/Bundler.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: bundle list --paths
      shows: each gem in the bundle with its install path
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bundler inventory command 1](../../study-results/Bundler/2026-11-21%20Bundler%20inventory%20command%201.md)'
  - '[2026-11-21 Bundler inventory command 2](../../study-results/Bundler/2026-11-21%20Bundler%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: bundle list prints the gems in the bundle and --paths adds their locations.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bundler](../../stores/Bundler.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

bundle list prints the gems in the bundle and --paths adds their locations.
