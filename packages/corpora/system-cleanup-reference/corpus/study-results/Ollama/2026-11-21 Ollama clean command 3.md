---
kind: source
store: '[Ollama](../../stores/Ollama.md)'
observed: '2026-11-21'
locator: AsMap
reportedIn:
- '[envconfig config.go](../../documents/Ollama/envconfig%20config.go.md)'
excerpt:
  exact: '"OLLAMA_NOPRUNE": {"OLLAMA_NOPRUNE", NoPrune(), "Do not prune model blobs on startup"},'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

envconfig config.go (https://raw.githubusercontent.com/ollama/ollama/main/envconfig/config.go) says, under AsMap:

> "OLLAMA_NOPRUNE": {"OLLAMA_NOPRUNE", NoPrune(), "Do not prune model blobs on startup"},
