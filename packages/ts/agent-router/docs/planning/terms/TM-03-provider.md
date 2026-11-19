---
id: TM-03
type: term
state: accepted
created: 2026-11-07
---

# TM-03: Provider

## Definition

The service that serves a model, such as Anthropic, OpenAI, Google or a local Ollama. A
[tool](TM-02-tool.md) reaches a model through a provider, and the catalogue records which
providers each tool can use (`serves`).

## Contrast

Not the [tool](TM-02-tool.md). The tool is the program you launch; the provider answers its model
calls.

Not the model. One provider serves many models.

## Notes

A provider row holds `{ kind, endpoint, key_env }`; `key_env` names an environment variable, never
a key. A [reference](TM-04-reference.md) can name one before the model: `pi/ollama/qwen3:4b`.
