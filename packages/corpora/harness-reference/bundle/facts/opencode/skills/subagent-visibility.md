---
type: Harness Fact
title: "OpenCode: Skills in subagents"
description: "Skills in subagents in OpenCode, as observed over time."
tags: [skills]
harness: opencode
subject: skills/subagent-visibility
observations:
  - value: {"supported": "partial", "per_agent_control": "permission.skill and tools.skill in agent config"}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-skills
    locator: "Override per agent"
    evidence: docs
    note: "The page does not mention subagents by name."
open:
  - question: "Does a subagent started by another agent see the skill tool and the same skill list?"
    observed: "2026-11-04"
    source: opencode-skills
sources:
  - id: opencode-skills
    resource: "https://opencode.ai/docs/skills"
    title: "OpenCode docs: Agent Skills"
---

What the sources say about [Skills in subagents](/subjects/skills/subagent-visibility.md) in [OpenCode](/harnesses/opencode.md).
Whether a subagent sees and can load the session's skills.

## Observations

- 2026-11-04: supported: partial; per agent control: permission.skill and tools.skill in agent config. The page does not mention subagents by name.[^opencode-skills]

  > Give specific agents different permissions than the global defaults.

## Open questions

- Does a subagent started by another agent see the skill tool and the same skill list?[^opencode-skills]

[^opencode-skills]: OpenCode docs: Agent Skills
