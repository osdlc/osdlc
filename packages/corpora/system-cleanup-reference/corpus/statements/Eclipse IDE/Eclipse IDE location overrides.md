---
proposition:
  subject: '[Eclipse IDE](../../stores/Eclipse%20IDE.md)'
  predicate: location/override
  object:
    vars: []
    settings:
    - -data
    - osgi.instance.area
    - osgi.instance.area.default
    - Bundle Pool Management dialog (agent and pool locations)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Eclipse IDE location overrides 1](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20location%20overrides%201.md)'
  - '[2026-11-21 Eclipse IDE location overrides 2](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20location%20overrides%202.md)'
  - '[2026-11-21 Eclipse IDE location overrides 3](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The runtime options page maps -data to osgi.instance.area (the workspace), and Oomph's
    dialog manages agent and pool disk locations.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Eclipse IDE](../../stores/Eclipse%20IDE.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The runtime options page maps -data to osgi.instance.area (the workspace), and Oomph's dialog manages agent and pool disk locations.
