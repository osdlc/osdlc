---
proposition:
  subject: '[Ollama](../../stores/Ollama.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: ollama rm <model>
      removes: a model (its manifest; blobs no other model uses)
    - command: ollama serve
      removes: on startup, prunes model blobs no manifest references (unless OLLAMA_NOPRUNE is set)
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Ollama clean command 1](../../study-results/Ollama/2026-11-21%20Ollama%20clean%20command%201.md)'
  - '[2026-11-21 Ollama clean command 2](../../study-results/Ollama/2026-11-21%20Ollama%20clean%20command%202.md)'
  - '[2026-11-21 Ollama clean command 3](../../study-results/Ollama/2026-11-21%20Ollama%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The CLI reference documents `ollama rm`; the server source documents startup pruning of
    model blobs, disabled by OLLAMA_NOPRUNE.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Ollama](../../stores/Ollama.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The docs do not say exactly which blobs `ollama rm` frees when several models share layers.
---

The CLI reference documents `ollama rm`; the server source documents startup pruning of model blobs, disabled by OLLAMA_NOPRUNE.
