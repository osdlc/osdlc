---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: mcp/stdio
  object:
    supported: true
    type: stdio
    type_optional: true
    address_key: command
    also: args, env, cwd
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi mcp stdio type source](../../study-results/Pi/2026-11-14%20Pi%20mcp%20stdio%20type%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: A string `command` with no type, or type stdio, selects stdio.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs mcp stdio keys](../../study-results/Pi/2026-11-14%20Pi%20docs%20mcp%20stdio%20keys.md)"
      - "[2026-11-14 Pi docs mcp type](../../study-results/Pi/2026-11-14%20Pi%20docs%20mcp%20type.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: MCP page.
reportedIn:
  - "[Pi source mcp config.ts at v1.5.2](../../documents/github.com/Pi%20source%20mcp%20config.ts%20at%20v1.5.2.md)"
  - "[Pi docs MCP Servers at v1.5.2](../../documents/github.com/Pi%20docs%20MCP%20Servers%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[stdio transport keys](../../subjects/mcp/stdio%20transport%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`command` is one executable, not a shell string; its arguments go in `args`.
