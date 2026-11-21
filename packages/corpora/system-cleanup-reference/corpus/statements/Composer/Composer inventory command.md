---
proposition:
  subject: '[Composer](../../stores/Composer.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: composer show
      shows: packages installed in the current project
    - command: composer config --global home
      shows: the location of the Composer home directory
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Composer inventory command 1](../../study-results/Composer/2026-11-21%20Composer%20inventory%20command%201.md)'
  - '[2026-11-21 Composer inventory command 2](../../study-results/Composer/2026-11-21%20Composer%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The CLI reference documents show for listing packages and config --global home for the
    home location.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Composer](../../stores/Composer.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No documented command reports cache size.
---

The CLI reference documents show for listing packages and config --global home for the home location.
