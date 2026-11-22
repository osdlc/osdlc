---
proposition:
  subject: '[uv](../../stores/uv.md)'
  predicate: liveness/in-use
  object:
    processes:
    - uv
    locks: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 uv in use 1](../../study-results/uv/2026-11-21%20uv%20in%20use%201.md)'
  - '[2026-11-21 uv in use 2](../../study-results/uv/2026-11-21%20uv%20in%20use%202.md)'
  - '[2026-11-21 uv in use 3](../../study-results/uv/2026-11-21%20uv%20in%20use%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The caching page says uv blocks cache-modifying commands while other uv processes run and
    warns never to edit the cache directly; it mentions a lock file in the cache directory without naming
    it.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[uv](../../stores/uv.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The docs mention the cache directory's lock file but do not give its file name.
---

The caching page says uv blocks cache-modifying commands while other uv processes run and warns never to edit the cache directly; it mentions a lock file in the cache directory without naming it.
