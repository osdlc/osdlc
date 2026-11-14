---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skills/subagent-visibility
  object:
    supported: partial
    per_agent_control: inherit_skills on the agent definition, true by default
    startup: a subagent whose definition inherits skills gets the parent session's discovered skills and skills config
    note: The built-in explore and plan subagents set inherit_skills to false.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok inherit skills field](../../study-results/Grok%20Build/2026-11-14%20grok%20inherit%20skills%20field.md)"
      - "[2026-11-14 grok explore no skills](../../study-results/Grok%20Build/2026-11-14%20grok%20explore%20no%20skills.md)"
      - "[2026-11-14 grok plan no skills](../../study-results/Grok%20Build/2026-11-14%20grok%20plan%20no%20skills.md)"
      - "[2026-11-14 grok subagent skills inherited](../../study-results/Grok%20Build/2026-11-14%20grok%20subagent%20skills%20inherited.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The agent definition field, the two built-in definitions that turn it off, and the spawn code that passes the parent skills.
reportedIn:
  - "[xai-org grok-build agent config.rs](../../documents/github.com/xai-org%20grok-build%20agent%20config.rs.md)"
  - "[xai-org grok-build subagent handle_request.rs](../../documents/github.com/xai-org%20grok-build%20subagent%20handle_request.rs.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Skills in subagents](../../subjects/skills/Skills%20in%20subagents.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Grok Build Skills in subagents open](Grok%20Build%20Skills%20in%20subagents%20open.md)"
---

Read from the source. No run was made, and no source read says how an agent file sets the field.
