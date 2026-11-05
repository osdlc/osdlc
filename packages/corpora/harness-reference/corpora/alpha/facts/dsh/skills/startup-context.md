---
type: Harness Fact
title: "DeepSeek Harness (dsh): Skills in context at startup"
description: "Skills in context at startup in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/startup-context
observations:
  - value: {"listed": "name and capped description of each model-invocable skill", "cap_chars_default": "500", "cap_setting": "catalogDescriptionMaxLength", "position": "user-role message before the first request", "bodies_paths_sources": "omitted"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-tool-skill
    locator: "packages/skill/tool-skill/README.md:54 at fcc0ad46"
    checked_version: "main at fcc0ad46"
    evidence: source
open:
  - question: "Is there a cap on the number of skills listed?"
    observed: "2026-11-04"
    source: dsh-tool-skill
sources:
  - id: dsh-tool-skill
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/tool-skill/README.md"
    title: "dsh tool-skill package README"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: name and capped description of each model-invocable skill; cap chars default: 500; cap setting: catalogDescriptionMaxLength; position: user-role message before the first request; bodies paths sources: omitted.[^dsh-tool-skill]

  > listing each confirmed skill's name and a capped description; a non-empty catalog tells the model to load a skill with the tool before acting on it

## Open questions

- Is there a cap on the number of skills listed?[^dsh-tool-skill]

[^dsh-tool-skill]: dsh tool-skill package README
