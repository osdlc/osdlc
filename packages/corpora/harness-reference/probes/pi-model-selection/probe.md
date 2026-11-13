---
type: Harness Probe
title: pi model selection
description: "Read pi's model flags from its help, list the models it can see, and run one prompt against a local model."
tags: [cli]
subjects: [cli/model-selection]
harnesses: [pi]
commands:
  pi:
    - "pi --version"
    - "pi --help"
    - "pi --list-models"
    - 'pi --model ollama/qwen3:4b -p "Reply with ok."'
    - 'pi --model ollama/qwen3:4b --thinking low -p "Reply with ok."'
record:
  - The harness version.
  - "The model, provider and thinking flags from `--help`."
  - "Whether `--list-models` shows the local models, and its columns."
  - The model and thinking level each prompt ran at.
safety:
  - "Needs a local Ollama server and a `providers.ollama` entry in pi's `models.json`. Adding that entry changes every pi session for the user."
---

# pi model selection

Checks how pi selects a model and an effort level. The prompts run against a local Ollama model,
so no hosted account is used.
