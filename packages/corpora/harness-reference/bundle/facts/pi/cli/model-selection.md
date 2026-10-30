---
type: Harness Fact
title: "pi: Model and effort flags"
description: "Model and effort flags in pi, as observed over time."
tags: [cli]
harness: pi
subject: cli/model-selection
observations:
  - value: { model: "--model <pattern> (provider/id selects the provider)", provider: "--provider <name>", effort: "--thinking off|minimal|low|medium|high|xhigh|max, clamped to the model; or a :<level> suffix on --model", model_list: "--list-models [search]", context: "contextWindow per model in ~/.pi/agent/models.json" }
    since: null
    until: null
    observed: "2026-10-09"
    source: notes-pi
    checked_version: "1.1.0"
    evidence: run
sources:
  - id: notes-pi
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-pi.md"
    title: "pi: harness notes for a dispatcher"
---

What the sources say about [Model and effort flags](/subjects/cli/model-selection.md) in
[pi](/harnesses/pi.md). Flags that pick the model, provider and reasoning effort for a run.

## Observations

- 2026-10-09: model: --model <pattern> (provider/id selects the provider); provider: --provider
  <name>; effort: --thinking off|minimal|low|medium|high|xhigh|max, clamped to the model; or
  a :<level> suffix on --model; model list: --list-models [search]; context: contextWindow per model
  in ~/.pi/agent/models.json.[^notes-pi]

[^notes-pi]: pi: harness notes for a dispatcher
