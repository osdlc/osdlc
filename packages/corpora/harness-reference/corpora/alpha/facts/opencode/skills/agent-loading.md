---
type: Harness Fact
title: "OpenCode: How the agent loads a skill"
description: "How the agent loads a skill in OpenCode, as observed over time."
tags: [skills]
harness: opencode
subject: skills/agent-loading
observations:
  - value: {"mechanism": "native skill tool", "trigger": "agent decides; loads on demand"}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-skills
    locator: "intro"
    evidence: docs
sources:
  - id: opencode-skills
    resource: "https://opencode.ai/docs/skills"
    title: "OpenCode docs: Agent Skills"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in [OpenCode](/harnesses/opencode.md).
How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-11-04: mechanism: native skill tool; trigger: agent decides; loads on demand.[^opencode-skills]

  > Skills are loaded on-demand via the native `skill` tool—agents see available skills and can load the full content when needed.

[^opencode-skills]: OpenCode docs: Agent Skills
