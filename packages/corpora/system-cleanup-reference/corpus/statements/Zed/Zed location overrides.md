---
proposition:
  subject: '[Zed](../../stores/Zed.md)'
  predicate: location/override
  object:
    vars:
    - XDG_DATA_HOME
    - XDG_CACHE_HOME
    - FLATPAK_XDG_DATA_HOME
    - FLATPAK_XDG_CACHE_HOME
    settings:
    - --user-data-dir
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Zed location overrides 1](../../study-results/Zed/2026-11-21%20Zed%20location%20overrides%201.md)'
  - '[2026-11-21 Zed location overrides 2](../../study-results/Zed/2026-11-21%20Zed%20location%20overrides%202.md)'
  - '[2026-11-21 Zed location overrides 3](../../study-results/Zed/2026-11-21%20Zed%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The CLI's --user-data-dir flag moves all user data, and on Linux paths.rs follows the XDG
    (and Flatpak XDG) variables.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Zed](../../stores/Zed.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The CLI's --user-data-dir flag moves all user data, and on Linux paths.rs follows the XDG (and Flatpak XDG) variables.
