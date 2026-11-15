---
id: TM-06
type: term
state: accepted
created: 2026-11-07
---

# TM-06: Tier

## Definition

A capability band for models: `fast`, `standard` or `max`. A [reference](TM-04-reference.md) can
name a tier instead of a model (`codex/max`), and the router picks that [tool](TM-02-tool.md)'s
current model in the tier.

## Contrast

Not a model name. `max` means "this tool's strongest current model", which changes as models are
released; `claude-opus-5-5` names one model.

Not [effort](TM-07-effort.md). A tier picks the model; effort sets how hard that model thinks.

## Notes

Classifier rules place each catalogue model in a tier, and pins can hold a tier to a model. A model
no rule places is in no tier: it can be named exactly, but no tier or chain picks it.
