---
type: Harness Fact
title: "DeepSeek Harness (dsh): Model and effort flags"
description: "Model and effort flags in DeepSeek Harness (dsh), as observed over time."
tags: [cli]
harness: dsh
subject: cli/model-selection
observations:
  - value: { model: "config row, not a CLI flag", provider: "DeepSeek by default; anthropic, openai, moonshotai, zai and custom endpoints through llm-pi-ai", acp_effort: session/set_config_option reasoning_effort }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: deepseek-ai/deepseek-harness docs/user/guide/providers.md at 5badb150
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Model and effort flags](/subjects/cli/model-selection.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). Flags that pick the model, provider and reasoning
effort for a run.

## Observations

- 2026-10-08: model: config row, not a CLI flag; provider: DeepSeek by default; anthropic, openai,
  moonshotai, zai and custom endpoints through llm-pi-ai; acp effort: session/set_config_option
  reasoning_effort.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
