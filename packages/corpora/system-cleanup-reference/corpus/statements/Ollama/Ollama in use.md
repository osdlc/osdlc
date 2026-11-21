---
proposition:
  subject: '[Ollama](../../stores/Ollama.md)'
  predicate: liveness/in-use
  object:
    processes:
    - ollama
    locks: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Ollama in use 1](../../study-results/Ollama/2026-11-21%20Ollama%20in%20use%201.md)'
  - '[2026-11-21 Ollama in use 2](../../study-results/Ollama/2026-11-21%20Ollama%20in%20use%202.md)'
  - '[2026-11-21 Ollama in use 3](../../study-results/Ollama/2026-11-21%20Ollama%20in%20use%203.md)'
  - '[2026-11-21 Ollama in use 4](../../study-results/Ollama/2026-11-21%20Ollama%20in%20use%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The server is the `ollama serve` process (systemd unit ollama.service on Linux; a tray/menubar
    app on macOS and Windows) listening on 127.0.0.1:11434; no lock file is documented.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Ollama](../../stores/Ollama.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No lock file in the models directory is documented.
---

The server is the `ollama serve` process (systemd unit ollama.service on Linux; a tray/menubar app on macOS and Windows) listening on 127.0.0.1:11434; no lock file is documented.
