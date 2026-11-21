---
proposition:
  subject: '[mise](../../stores/mise.md)'
  predicate: liveness/in-use
  object:
    processes:
    - mise
    locks: []
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 mise in use 1](../../study-results/mise/2026-11-21%20mise%20in%20use%201.md)'
  - '[2026-11-21 mise in use 2](../../study-results/mise/2026-11-21%20mise%20in%20use%202.md)'
  - '[2026-11-21 mise in use 3](../../study-results/mise/2026-11-21%20mise%20in%20use%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: mise prune itself keeps versions a running process started from, and the docs say to run
    mise cache clear only while no install is in progress; no lock file path is documented.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[mise](../../stores/mise.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No lock file path is documented.
---

mise prune itself keeps versions a running process started from, and the docs say to run mise cache clear only while no install is in progress; no lock file path is documented.
