---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: mcp/streamable-http
  object:
    supported: true
    type: http
    type_alias: streamable-http
    type_optional: true
    address_key: url
    also: headers, oauth
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi mcp type values source](../../study-results/Pi/2026-11-14%20Pi%20mcp%20type%20values%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: A string `url` with no type, or type http or streamable-http, selects streamable HTTP.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs mcp http keys](../../study-results/Pi/2026-11-14%20Pi%20docs%20mcp%20http%20keys.md)"
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
subject: "[Streamable HTTP transport keys](../../subjects/mcp/Streamable%20HTTP%20transport%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

It is the only remote transport: SSE is rejected.
