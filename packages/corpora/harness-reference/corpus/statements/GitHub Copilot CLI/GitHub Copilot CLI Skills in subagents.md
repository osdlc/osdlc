---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skills/subagent-visibility
  object:
    preload: a custom agent's `skills` field loads skill content into the agent's context at startup
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Custom agent skills field changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Custom%20agent%20skills%20field%20changelog.md)"
      - "[2026-11-14 GitHub Copilot CLI Custom agent skills warning changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Custom%20agent%20skills%20warning%20changelog.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The changelog records the field (1.0.22) and a warning when the configured skills cannot be loaded (1.0.108).
reportedIn:
  - "[GitHub Copilot CLI changelog.md at 16604af](../../documents/GitHub/GitHub%20Copilot%20CLI%20changelog.md%20at%2016604af.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Skills in subagents](../../subjects/skills/Skills%20in%20subagents.md)"
scope:
  since: 1.0.22
  until: null
  platform: []
  model: null
status: current
supersedes: "[GitHub Copilot CLI Skills in subagents open](GitHub%20Copilot%20CLI%20Skills%20in%20subagents%20open.md)"
open:
  - Does a subagent see and load the session's skills when its definition has no `skills` field?
---

A custom agent can preload skills through its `skills` field. No source read says whether a subagent sees the session's other skills.
