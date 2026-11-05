---
type: Harness Fact
title: "OpenCode: Skill picked from its description"
description: "Skill picked from its description in OpenCode, as observed over time."
tags: [skills]
harness: opencode
subject: skills/description-match
observations:
  - value: {"model_picks_from_description": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-src-skill-tool
    locator: "packages/core/src/tool/plugin/skill.ts:21-25 at 8f3f7b7 (dev branch)"
    evidence: source
  - value: {"writing_guidance": "specific enough for the agent to choose correctly"}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-skills
    locator: "Follow length rules"
    evidence: docs
sources:
  - id: opencode-src-skill-tool
    resource: "https://github.com/anomalyco/opencode/blob/8f3f7b74c982fc144b147d524d0a70d671187a3b/packages/core/src/tool/plugin/skill.ts"
    title: "OpenCode source: skill tool (dev at 8f3f7b7)"
  - id: opencode-skills
    resource: "https://opencode.ai/docs/skills"
    title: "OpenCode docs: Agent Skills"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [OpenCode](/harnesses/opencode.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: model picks from description: yes.[^opencode-src-skill-tool]

  > Load a specialized skill's instructions and resources into the current conversation when the task at hand matches its description.
- 2026-11-04: writing guidance: specific enough for the agent to choose correctly.[^opencode-skills]

  > Keep it specific enough for the agent to choose correctly.

[^opencode-src-skill-tool]: OpenCode source: skill tool (dev at 8f3f7b7)
[^opencode-skills]: OpenCode docs: Agent Skills
