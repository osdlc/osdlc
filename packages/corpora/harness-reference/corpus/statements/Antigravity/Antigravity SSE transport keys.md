---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: mcp/sse
  object:
    supported: false
    basis: documented
    note: the legacy HTTP+SSE transport and the httpUrl field are not supported; a remote server must use Streamable HTTP
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 mcp remote transport](../../study-results/Antigravity/2026-11-14%20mcp%20remote%20transport.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The MCP page says the legacy HTTP+SSE transport is not supported.
reportedIn:
  - "[Antigravity docs MCP markdown](../../documents/antigravity.google/Antigravity%20docs%20MCP%20markdown.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[SSE transport keys](../../subjects/mcp/SSE%20transport%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The statement is about `mcp_config.json`. The same page says the Python SDK can connect SSE servers in code.
