---
proposition:
  subject: '[Ollama](../../stores/Ollama.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: ollama ls
      shows: local models (alias of ollama list) with their sizes
    - command: ollama ps
      shows: models currently loaded in memory
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Ollama inventory command 1](../../study-results/Ollama/2026-11-21%20Ollama%20inventory%20command%201.md)'
  - '[2026-11-21 Ollama inventory command 2](../../study-results/Ollama/2026-11-21%20Ollama%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The CLI reference lists `ollama ls` and `ollama ps`.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Ollama](../../stores/Ollama.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The CLI reference does not describe the columns `ollama ls` prints (sizes are shown in practice but
  not documented on this page).
---

The CLI reference lists `ollama ls` and `ollama ps`.
