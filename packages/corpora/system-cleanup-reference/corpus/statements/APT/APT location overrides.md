---
proposition:
  subject: '[APT](../../stores/APT.md)'
  predicate: location/override
  object:
    vars:
    - APT_CONFIG
    settings:
    - Dir::Cache
    - Dir::Cache::Archives
    - APT::Clean-Installed
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 APT location overrides 1](../../study-results/APT/2026-11-21%20APT%20location%20overrides%201.md)'
  - '[2026-11-21 APT location overrides 2](../../study-results/APT/2026-11-21%20APT%20location%20overrides%202.md)'
  - '[2026-11-21 APT location overrides 3](../../study-results/APT/2026-11-21%20APT%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: apt.conf documents Dir::Cache and Dir::Cache::Archives as the cache location settings;
    APT_CONFIG names an alternative config file.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[APT](../../stores/APT.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

apt.conf documents Dir::Cache and Dir::Cache::Archives as the cache location settings; APT_CONFIG names an alternative config file.
