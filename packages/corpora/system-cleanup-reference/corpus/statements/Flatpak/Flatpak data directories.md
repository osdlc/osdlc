---
proposition:
  subject: '[Flatpak](../../stores/Flatpak.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: /var/lib/flatpak
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/flatpak
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.var/app
      holds: state
      rebuild: lost
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Flatpak data directories 1](../../study-results/Flatpak/2026-11-21%20Flatpak%20data%20directories%201.md)'
  - '[2026-11-21 Flatpak data directories 2](../../study-results/Flatpak/2026-11-21%20Flatpak%20data%20directories%202.md)'
  - '[2026-11-21 Flatpak data directories 3](../../study-results/Flatpak/2026-11-21%20Flatpak%20data%20directories%203.md)'
  - '[2026-11-21 Flatpak data directories 4](../../study-results/Flatpak/2026-11-21%20Flatpak%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The reference gives both installation roots; ~/.var/app holds per-app user data that is
    lost if deleted.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Flatpak](../../stores/Flatpak.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The reference gives both installation roots; ~/.var/app holds per-app user data that is lost if deleted.
