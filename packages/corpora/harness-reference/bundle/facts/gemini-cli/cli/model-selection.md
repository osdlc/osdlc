---
type: Harness Fact
title: "Gemini CLI: Model and effort flags"
description: "Model and effort flags in Gemini CLI, as observed over time."
tags: [cli]
harness: gemini-cli
subject: cli/model-selection
observations:
  - value: { model: "-m, --model <string> (also GEMINI_MODEL)", provider: Google only, effort: "none; thinking config lives in settings (modelConfigs, thinkingBudget)", model_list: none }
    since: null
    until: null
    observed: "2026-10-09"
    source: notes-gemini
    checked_version: "0.46.0"
    evidence: help-text
sources:
  - id: notes-gemini
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-gemini.md"
    title: "gemini: harness notes for a dispatcher"
---

What the sources say about [Model and effort flags](/subjects/cli/model-selection.md) in
[Gemini CLI](/harnesses/gemini-cli.md). Flags that pick the model, provider and reasoning effort for
a run.

## Observations

- 2026-10-09: model: -m, --model <string> (also GEMINI_MODEL); provider: Google only; effort: none;
  thinking config lives in settings (modelConfigs, thinkingBudget); model list: none.[^notes-gemini]

[^notes-gemini]: gemini: harness notes for a dispatcher
