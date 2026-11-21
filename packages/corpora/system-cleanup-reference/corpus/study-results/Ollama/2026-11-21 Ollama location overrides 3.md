---
kind: source
store: '[Ollama](../../stores/Ollama.md)'
observed: '2026-11-21'
locator: func Models
reportedIn:
- '[envconfig config.go](../../documents/Ollama/envconfig%20config.go.md)'
excerpt:
  exact: // Models returns the path to the models directory. Models directory can be configured via the
    OLLAMA_MODELS environment variable.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

envconfig config.go (https://raw.githubusercontent.com/ollama/ollama/main/envconfig/config.go) says, under func Models:

> // Models returns the path to the models directory. Models directory can be configured via the OLLAMA_MODELS environment variable.
