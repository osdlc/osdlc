---
type: Harness Fact
title: "DeepSeek Harness (dsh): Skill picked from its description"
description: "Skill picked from its description in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/description-match
observations:
  - value: {"supported": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-tool-skill
    locator: "Skill catalog template in packages/skill/tool-skill/README.md at fcc0ad46"
    evidence: source
sources:
  - id: dsh-tool-skill
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/tool-skill/README.md"
    title: "dsh tool-skill package README"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: supported: yes.[^dsh-tool-skill]

  > If the user names a skill, or the task clearly matches a skill's description, call the `skill` tool with the exact skill name before taking task actions.

[^dsh-tool-skill]: dsh tool-skill package README
