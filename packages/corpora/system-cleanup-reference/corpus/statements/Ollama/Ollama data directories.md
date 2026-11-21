---
proposition:
  subject: '[Ollama](../../stores/Ollama.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/.ollama/models
      holds: models
      rebuild: re-download
    - platform: linux
      path: /usr/share/ollama/.ollama/models
      holds: models
      rebuild: re-download
    - platform: linux
      path: ~/.ollama/models
      holds: models
      rebuild: re-download
    - platform: windows
      path: C:\Users\%username%\.ollama\models
      holds: models
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\Ollama'
      holds: logs
      rebuild: rebuild
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Ollama data directories 1](../../study-results/Ollama/2026-11-21%20Ollama%20data%20directories%201.md)'
  - '[2026-11-21 Ollama data directories 2](../../study-results/Ollama/2026-11-21%20Ollama%20data%20directories%202.md)'
  - '[2026-11-21 Ollama data directories 3](../../study-results/Ollama/2026-11-21%20Ollama%20data%20directories%203.md)'
  - '[2026-11-21 Ollama data directories 4](../../study-results/Ollama/2026-11-21%20Ollama%20data%20directories%204.md)'
  - '[2026-11-21 Ollama data directories 5](../../study-results/Ollama/2026-11-21%20Ollama%20data%20directories%205.md)'
  - '[2026-11-21 Ollama data directories 6](../../study-results/Ollama/2026-11-21%20Ollama%20data%20directories%206.md)'
  - '[2026-11-21 Ollama data directories 7](../../study-results/Ollama/2026-11-21%20Ollama%20data%20directories%207.md)'
  - '[2026-11-21 Ollama data directories 8](../../study-results/Ollama/2026-11-21%20Ollama%20data%20directories%208.md)'
  - '[2026-11-21 Ollama data directories 9](../../study-results/Ollama/2026-11-21%20Ollama%20data%20directories%209.md)'
  - '[2026-11-21 Ollama data directories 10](../../study-results/Ollama/2026-11-21%20Ollama%20data%20directories%2010.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The FAQ gives the per-platform model paths (the Linux path is the home of the ollama service
    user from the standard installer; the source default for any user running the server is $HOME/.ollama/models).
    Pulled models can be fetched again, but models built with `ollama create` from a Modelfile or from
    local GGUF/Safetensors weights live in the same blob store and are lost unless the user still has
    the source weights and Modelfile.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Ollama](../../stores/Ollama.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The docs give no way to tell, from the files on disk, a model built with `ollama create` (lost if deleted)
  from one pulled from the registry (re-downloadable).
---

The FAQ gives the per-platform model paths (the Linux path is the home of the ollama service user from the standard installer; the source default for any user running the server is $HOME/.ollama/models). Pulled models can be fetched again, but models built with `ollama create` from a Modelfile or from local GGUF/Safetensors weights live in the same blob store and are lost unless the user still has the source weights and Modelfile.
