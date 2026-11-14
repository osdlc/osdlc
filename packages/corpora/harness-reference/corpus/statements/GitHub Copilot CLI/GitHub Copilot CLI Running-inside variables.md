---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: cli/current-env
  object:
    supported: true
    vars:
      - name: COPILOT_CLI
        value: "1"
        meaning: the process is a Copilot CLI subprocess; a Git hook can use it to skip interactive prompts
    set_by: child-commands
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI COPILOT_CLI variable changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20COPILOT_CLI%20variable%20changelog.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 0.0.421 changelog entry names the variable and its value.
reportedIn:
  - "[GitHub Copilot CLI changelog.md at 16604af](../../documents/GitHub/GitHub%20Copilot%20CLI%20changelog.md%20at%2016604af.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Running-inside variables](../../subjects/cli/Running-inside%20variables.md)"
scope:
  since: 0.0.421
  until: null
  platform: []
  model: null
status: current
---

The changelog for 0.0.421 says Git hooks can detect Copilot CLI subprocesses through `COPILOT_CLI=1`. The docs pages read do not list it among the environment variables, which are the ones a user sets.
