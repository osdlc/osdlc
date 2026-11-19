---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: mcp/sse
  object:
    supported: false
    documented: true
    basis: documented
    note: "`type: sse` is rejected; use the server's streamable HTTP URL"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi mcp transport selection source](../../study-results/Pi/2026-11-14%20Pi%20mcp%20transport%20selection%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The config parser returns an error for type sse.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs mcp http keys](../../study-results/Pi/2026-11-14%20Pi%20docs%20mcp%20http%20keys.md)"
      - "[2026-11-14 Pi docs mcp sse rejected](../../study-results/Pi/2026-11-14%20Pi%20docs%20mcp%20sse%20rejected.md)"
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
subject: "[SSE transport keys](../../subjects/mcp/SSE%20transport%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Both the docs and the config parser say so directly.
