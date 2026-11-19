---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: mcp/strict-config
  object:
    supported: partial
    strict_argv:
      - --allowed-mcp-server-names
      - "{name}"
    note: the only MCP flag in the 0.65.0 help names allowed servers; no flag passes an MCP config file
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Allowed MCP server names help](../../study-results/Gemini%20CLI/2026-11-09%20Allowed%20MCP%20server%20names%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text for 0.65.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Strict MCP config](../../subjects/mcp/Strict%20MCP%20config.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
