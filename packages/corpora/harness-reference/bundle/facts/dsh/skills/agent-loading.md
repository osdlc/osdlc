---
type: Harness Fact
title: "DeepSeek Harness (dsh): How the agent loads a skill"
description: "How the agent loads a skill in DeepSeek Harness (dsh), as observed over time."
tags: [skills]
harness: dsh
subject: skills/agent-loading
observations:
  - value: { mechanism: "a `skill` tool" }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: deepseek-ai/deepseek-harness packages/skill/skill-filesystem/README.md at 5badb150
    checked_version: "0.2.1-alpha.1"
    evidence: source
  - value: {"mechanism": "skill tool", "loads": "on demand: the model calls skill with the exact name; a /name token in user input injects the body without a tool call"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-tool-skill
    locator: "packages/skill/tool-skill/README.md:55 at fcc0ad46"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
  - id: dsh-tool-skill
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/tool-skill/README.md"
    title: "dsh tool-skill package README"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-10-08: mechanism: a `skill` tool.[^notes-dsh]
- 2026-11-04: mechanism: skill tool; loads: on demand: the model calls skill with the exact name; a /name token in user input injects the body without a tool call.[^dsh-tool-skill]

  > The model calls `skill` with the exact skill name and receives the full instruction body plus resource guidance in a canonical `<skill_content>` block

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher
[^dsh-tool-skill]: dsh tool-skill package README
