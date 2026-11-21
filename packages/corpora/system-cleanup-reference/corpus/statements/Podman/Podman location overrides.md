---
proposition:
  subject: '[Podman](../../stores/Podman.md)'
  predicate: location/override
  object:
    vars:
    - CONTAINERS_STORAGE_CONF
    - XDG_DATA_HOME
    settings:
    - graphroot
    - imagestore
    - --root
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Podman location overrides 1](../../study-results/Podman/2026-11-21%20Podman%20location%20overrides%201.md)'
  - '[2026-11-21 Podman location overrides 2](../../study-results/Podman/2026-11-21%20Podman%20location%20overrides%202.md)'
  - '[2026-11-21 Podman location overrides 3](../../study-results/Podman/2026-11-21%20Podman%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: podman(1) documents CONTAINERS_STORAGE_CONF and --root, and containers-storage.conf(5)
    documents graphroot and imagestore, with XDG_DATA_HOME changing the rootless default.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Podman](../../stores/Podman.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

podman(1) documents CONTAINERS_STORAGE_CONF and --root, and containers-storage.conf(5) documents graphroot and imagestore, with XDG_DATA_HOME changing the rootless default.
