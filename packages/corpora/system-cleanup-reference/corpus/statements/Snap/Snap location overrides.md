---
proposition:
  subject: '[Snap](../../stores/Snap.md)'
  predicate: location/override
  object:
    vars: []
    settings:
    - refresh.retain
    - snapshots.automatic.retention
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Snap location overrides 1](../../study-results/Snap/2026-11-21%20Snap%20location%20overrides%201.md)'
  - '[2026-11-21 Snap location overrides 2](../../study-results/Snap/2026-11-21%20Snap%20location%20overrides%202.md)'
  - '[2026-11-21 Snap location overrides 3](../../study-results/Snap/2026-11-21%20Snap%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: No setting moves the data; refresh.retain and snapshots.automatic.retention bound how much
    is kept. Set them with sudo snap set system.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Snap](../../stores/Snap.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No documented setting relocates /var/lib/snapd.
---

No setting moves the data; refresh.retain and snapshots.automatic.retention bound how much is kept. Set them with sudo snap set system.
