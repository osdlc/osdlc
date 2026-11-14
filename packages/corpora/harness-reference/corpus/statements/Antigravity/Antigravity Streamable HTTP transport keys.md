---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: mcp/streamable-http
  object:
    supported: true
    address_key: serverUrl
    also: url also works; headers
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 mcp transport property](../../study-results/Antigravity/2026-11-14%20mcp%20transport%20property.md)"
      - "[2026-11-14 mcp remote transport](../../study-results/Antigravity/2026-11-14%20mcp%20remote%20transport.md)"
      - "[2026-11-14 mcp headers key](../../study-results/Antigravity/2026-11-14%20mcp%20headers%20key.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The MCP page says a remote server uses Streamable HTTP and sets its endpoint in serverUrl.
reportedIn:
  - "[Antigravity docs MCP](../../documents/antigravity.google/Antigravity%20docs%20MCP.md)"
  - "[Antigravity docs MCP markdown](../../documents/antigravity.google/Antigravity%20docs%20MCP%20markdown.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Streamable HTTP transport keys](../../subjects/mcp/Streamable%20HTTP%20transport%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

An entry with `serverUrl` (or `url`) is a remote Streamable HTTP server, the only remote transport supported. The docs name no `type` key.
