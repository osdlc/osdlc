---
methodType: probe
harnesses:
  - "[Pi](../../harnesses/Pi.md)"
subjects:
  - "[Model and effort flags](../../subjects/cli/Model%20and%20effort%20flags.md)"
commands:
  pi:
    - pi --version
    - pi --help
    - pi --list-models
    - pi --model ollama/qwen3:4b -p "Reply with ok."
    - pi --model ollama/qwen3:4b --thinking low -p "Reply with ok."
record:
  - The harness version.
  - The model, provider and thinking flags from `--help`.
  - Whether `--list-models` shows the local models, and its columns.
  - The model and thinking level each prompt ran at.
safety:
  - Needs a local Ollama server and a `providers.ollama` entry in pi's `models.json`. Adding that entry changes every pi session for the user.
imported_from: probe:pi-model-selection
---

# pi model selection

Checks how pi selects a model and an effort level. The prompts run against a local Ollama model,
so no hosted account is used.

Imported from `probes/pi-model-selection/probe.md`.
