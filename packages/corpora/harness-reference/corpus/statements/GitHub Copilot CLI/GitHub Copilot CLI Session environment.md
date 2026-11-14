---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: cli/session-env
  object:
    vars:
      - COPILOT_AGENT_SESSION_ID
    note: set for shell commands and MCP servers
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI COPILOT_AGENT_SESSION_ID changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20COPILOT_AGENT_SESSION_ID%20changelog.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 1.0.29 changelog entry names the variable.
reportedIn:
  - "[GitHub Copilot CLI changelog.md at 16604af](../../documents/GitHub/GitHub%20Copilot%20CLI%20changelog.md%20at%2016604af.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Session environment](../../subjects/cli/Session%20environment.md)"
scope:
  since: 1.0.29
  until: null
  platform: []
  model: null
status: current
---

The changelog for 1.0.29 says shell commands and MCP servers receive `COPILOT_AGENT_SESSION_ID`. `COPILOT_CLI=1` is recorded under Running-inside variables.
