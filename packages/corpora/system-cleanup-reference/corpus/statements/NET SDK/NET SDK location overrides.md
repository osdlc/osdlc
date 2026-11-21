---
proposition:
  subject: '[NET SDK](../../stores/NET%20SDK.md)'
  predicate: location/override
  object:
    vars:
    - DOTNET_CLI_HOME
    - DOTNET_ROOT
    settings:
    - --install-dir
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 NET SDK location overrides 1](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20location%20overrides%201.md)'
  - '[2026-11-21 NET SDK location overrides 2](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20location%20overrides%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The environment-variable reference describes DOTNET_CLI_HOME as the place for workload
    packs and other CLI data, and the install script takes --install-dir.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[NET SDK](../../stores/NET%20SDK.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The environment-variable reference describes DOTNET_CLI_HOME as the place for workload packs and other CLI data, and the install script takes --install-dir.
