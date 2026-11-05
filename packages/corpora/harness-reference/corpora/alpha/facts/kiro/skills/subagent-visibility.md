---
type: Harness Fact
title: "Kiro: Skills in subagents"
description: "Skills in subagents in Kiro, as observed over time."
tags: [skills]
harness: kiro
subject: skills/subagent-visibility
observations:
  - value: {"custom_agents_inherit_default_resources": true, "setting": "chat.disableInheritingDefaultResources (default false)", "startup": "metadata only, full content on demand"}
    since: null
    until: null
    observed: "2026-11-04"
    source: kiro-custom-agents-config
    evidence: docs
    note: "Conflicts with the Skills page, which says custom agents do not load skills by default. Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"custom_agents_load_skills_by_default": false, "how_to_add": "skill:// URIs in the agent resources field"}
    since: null
    until: null
    observed: "2026-11-04"
    source: kiro-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Can a subagent see and load the parent session skills? The subagents page names only steering, MCP and permissions as shared."
    observed: "2026-11-04"
    source: kiro-custom-agents-subagents
sources:
  - id: kiro-custom-agents-config
    resource: "https://kiro.dev/docs/custom-agents/configuration-reference/"
    title: "Kiro docs: Custom agents configuration reference"
  - id: kiro-skills
    resource: "https://kiro.dev/docs/skills/"
    title: "Kiro docs: Agent Skills"
  - id: kiro-custom-agents-subagents
    resource: "https://kiro.dev/docs/custom-agents/subagents/"
    title: "Kiro docs: Subagents"
---

What the sources say about [Skills in subagents](/subjects/skills/subagent-visibility.md) in [Kiro](/harnesses/kiro.md).
Whether a subagent sees and can load the session's skills.

## Observations

- 2026-11-04: custom agents inherit default resources: yes; setting: chat.disableInheritingDefaultResources (default false); startup: metadata only, full content on demand. Conflicts with the Skills page, which says custom agents do not load skills by default. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^kiro-custom-agents-config]

  > only metadata (name and description) is loaded at startup
- 2026-11-04: custom agents load skills by default: no; how to add: skill:// URIs in the agent resources field. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^kiro-skills]

  > Custom agents don't load skills by default.

## Open questions

- Can a subagent see and load the parent session skills? The subagents page names only steering, MCP and permissions as shared.[^kiro-custom-agents-subagents]

[^kiro-custom-agents-config]: Kiro docs: Custom agents configuration reference
[^kiro-skills]: Kiro docs: Agent Skills
[^kiro-custom-agents-subagents]: Kiro docs: Subagents
