---
proposition:
  subject: '[Flatpak](../../stores/Flatpak.md)'
  predicate: liveness/in-use
  object:
    processes: []
    locks: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Flatpak in use 1](../../study-results/Flatpak/2026-11-21%20Flatpak%20in%20use%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: flatpak ps lists running instances; a cleaner should not uninstall refs those instances
    use.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Flatpak](../../stores/Flatpak.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Flatpak lock files are not documented in the reference.
---

flatpak ps lists running instances; a cleaner should not uninstall refs those instances use.
