---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: mcp/strict-config
  object:
    supported: partial
    inline_json: true
    ignores:
      - project configuration (OPENCODE_DISABLE_PROJECT_CONFIG)
    note: no MCP flag on run; OPENCODE_CONFIG_CONTENT passes inline JSON config
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 OpenCode Inline config env docs](../../study-results/OpenCode/2026-11-09%20OpenCode%20Inline%20config%20env%20docs.md)"
      - "[2026-11-09 OpenCode Disable project config docs](../../study-results/OpenCode/2026-11-09%20OpenCode%20Disable%20project%20config%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: env var table.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Strict MCP config](../../subjects/mcp/Strict%20MCP%20config.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Whether the inline config can exclude the user MCP servers was not checked.
---
