---
proposition:
  subject: '[llama.cpp](../../stores/llama.cpp.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: llama-server --cache-list
      shows: models in the cache (-cl)
    - command: GET /models (llama-server router API)
      shows: models the router knows, with memory measurements
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 llama.cpp inventory command 1](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20inventory%20command%201.md)'
  - '[2026-11-21 llama.cpp inventory command 2](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The common argument tables list -cl/--cache-list; the server README describes GET /models.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[llama.cpp](../../stores/llama.cpp.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Whether --cache-list prints sizes is not documented.
---

The common argument tables list -cl/--cache-list; the server README describes GET /models.
