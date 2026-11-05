---
type: Harness Fact
title: "DeepSeek Harness (dsh): Skills in subagents"
description: "Skills in subagents in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/subagent-visibility
observations: []
open:
  - question: "Does a subagent see the session skill catalog and have the skill tool?"
    observed: "2026-11-04"
    source: dsh-tool-skill
sources:
  - id: dsh-tool-skill
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/tool-skill/README.md"
    title: "dsh tool-skill package README"
---

What the sources say about [Skills in subagents](/subjects/skills/subagent-visibility.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
Whether a subagent sees and can load the session's skills.

## Open questions

- Does a subagent see the session skill catalog and have the skill tool?[^dsh-tool-skill]

[^dsh-tool-skill]: dsh tool-skill package README
