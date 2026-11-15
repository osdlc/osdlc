---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: mcp/config-file
  object:
    file: ~/.pi/agent/mcp.json
    format: JSON
    key: mcpServers
    supported: true
    note: project servers in .pi/mcp.json after project trust; `pi mcp add|list|login` manage it
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi help mcp](../../study-results/Pi/2026-11-09%20Pi%20help%20mcp.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`pi mcp --help` names the files."
  - hasEvidenceItems:
      - "[2026-11-09 Pi mcp servers key](../../study-results/Pi/2026-11-09%20Pi%20mcp%20servers%20key.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: mcpServers key.
  - hasEvidenceItems:
      - "[2026-11-09 Pi changelog 0.99.0 mcp](../../study-results/Pi/2026-11-09%20Pi%20changelog%200.99.0%20mcp.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Released in 0.99.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[MCP config file](../../subjects/mcp/MCP%20config%20file.md)"
scope:
  since: 0.99.0
  until: null
  platform: []
  model: null
status: current
supersedes: "[Pi MCP config file](Pi%20MCP%20config%20file.md)"
---

Replaces the earlier "no MCP" claim, which held before 0.99.0.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
