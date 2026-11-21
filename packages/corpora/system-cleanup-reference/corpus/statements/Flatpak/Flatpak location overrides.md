---
proposition:
  subject: '[Flatpak](../../stores/Flatpak.md)'
  predicate: location/override
  object:
    vars:
    - FLATPAK_USER_DIR
    - FLATPAK_SYSTEM_DIR
    - XDG_DATA_HOME
    settings:
    - /etc/flatpak/installations.d
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Flatpak location overrides 1](../../study-results/Flatpak/2026-11-21%20Flatpak%20location%20overrides%201.md)'
  - '[2026-11-21 Flatpak location overrides 2](../../study-results/Flatpak/2026-11-21%20Flatpak%20location%20overrides%202.md)'
  - '[2026-11-21 Flatpak location overrides 3](../../study-results/Flatpak/2026-11-21%20Flatpak%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Environment variables move the default installations; installations.d adds more.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Flatpak](../../stores/Flatpak.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Environment variables move the default installations; installations.d adds more.
