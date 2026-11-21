---
proposition:
  subject: '[vcpkg](../../stores/vcpkg.md)'
  predicate: location/override
  object:
    vars:
    - VCPKG_DEFAULT_BINARY_CACHE
    - VCPKG_BINARY_SOURCES
    - VCPKG_DOWNLOADS
    - VCPKG_ROOT
    - XDG_CACHE_HOME
    settings:
    - --binarysource
    - --downloads-root
    - --x-buildtrees-root
    - --x-packages-root
    - --x-install-root
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 vcpkg location overrides 1](../../study-results/vcpkg/2026-11-21%20vcpkg%20location%20overrides%201.md)'
  - '[2026-11-21 vcpkg location overrides 2](../../study-results/vcpkg/2026-11-21%20vcpkg%20location%20overrides%202.md)'
  - '[2026-11-21 vcpkg location overrides 3](../../study-results/vcpkg/2026-11-21%20vcpkg%20location%20overrides%203.md)'
  - '[2026-11-21 vcpkg location overrides 4](../../study-results/vcpkg/2026-11-21%20vcpkg%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The environment-variable and common-options pages document each of these.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[vcpkg](../../stores/vcpkg.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The environment-variable and common-options pages document each of these.
