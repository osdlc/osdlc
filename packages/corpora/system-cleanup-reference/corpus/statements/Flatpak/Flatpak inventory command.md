---
proposition:
  subject: '[Flatpak](../../stores/Flatpak.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: flatpak list --columns=application,size
      shows: installed apps and runtimes with installed size
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Flatpak inventory command 1](../../study-results/Flatpak/2026-11-21%20Flatpak%20inventory%20command%201.md)'
  - '[2026-11-21 Flatpak inventory command 2](../../study-results/Flatpak/2026-11-21%20Flatpak%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: flatpak list shows apps and runtimes, and its size column gives installed size.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Flatpak](../../stores/Flatpak.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

flatpak list shows apps and runtimes, and its size column gives installed size.
