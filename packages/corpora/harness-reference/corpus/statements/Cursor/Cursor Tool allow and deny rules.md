---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: permissions/tool-rules
  object:
    supported: true
    config_key: permissions.allow / permissions.deny
    syntax: Shell(cmd) Read(glob) Write(glob) WebFetch(domain) Mcp(server:tool)
    precedence: deny rules take precedence over allow rules
    note: set in ~/.cursor/cli-config.json or <project>/.cursor/cli.json; no command-line flag
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs permissions location](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20permissions%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Rule files.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs permissions syntax](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20permissions%20syntax.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Rule syntax.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs permissions precedence](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20permissions%20precedence.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Precedence.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs permissions mcp](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20permissions%20mcp.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: MCP rule form.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
