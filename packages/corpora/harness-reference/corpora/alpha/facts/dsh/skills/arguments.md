---
type: Harness Fact
title: "DeepSeek Harness (dsh): Skill arguments"
description: "Skill arguments in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/arguments
observations:
  - value: {"supported": false, "user_invocation": "a /name token injects the skill instructions"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-tool-skill
    locator: "packages/skill/tool-skill/README.md:56 at fcc0ad46"
    evidence: source
    note: "No argument passing is described."
open:
  - question: "Is text typed after /name passed to the skill in any form?"
    observed: "2026-11-04"
    source: dsh-tool-skill
sources:
  - id: dsh-tool-skill
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/tool-skill/README.md"
    title: "dsh tool-skill package README"
---

What the sources say about [Skill arguments](/subjects/skills/arguments.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
How text typed after a skill invocation reaches the skill.

## Observations

- 2026-11-04: supported: no; user invocation: a /name token injects the skill instructions. No argument passing is described.[^dsh-tool-skill]

  > A `/name` token in direct user input that names a user-invocable skill injects that skill's instructions into the step

## Open questions

- Is text typed after /name passed to the skill in any form?[^dsh-tool-skill]

[^dsh-tool-skill]: dsh tool-skill package README
