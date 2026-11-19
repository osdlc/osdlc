---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: mcp/strict-config
  object:
    supported: false
    note: no flag takes an MCP config file or ignores user and project servers
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help mcp](../../study-results/Cursor/2026-11-09%20Cursor%20help%20mcp.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`agent mcp` only logs in, lists, enables and disables servers."
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help approve-mcps](../../study-results/Cursor/2026-11-09%20Cursor%20help%20approve-mcps.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The only MCP flag on the root command approves servers.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Strict MCP config](../../subjects/mcp/Strict%20MCP%20config.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Absence in --help only.
