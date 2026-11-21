---
proposition:
  subject: '[Jan](../../stores/Jan.md)'
  predicate: liveness/in-use
  object:
    processes:
    - jan-llama-worker
    locks: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Jan in use 1](../../study-results/Jan/2026-11-21%20Jan%20in%20use%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Since v0.8.5 the llama.cpp engine runs in a supervised worker process named jan-llama-worker.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Jan](../../stores/Jan.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The main app's process name and any lock files are not documented.
---

Since v0.8.5 the llama.cpp engine runs in a supervised worker process named jan-llama-worker.
