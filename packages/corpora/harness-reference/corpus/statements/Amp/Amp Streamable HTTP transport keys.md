---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: mcp/streamable-http
  object:
    supported: true
    address_key: url
    also: headers
    transport: streamable HTTP
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 mcp server fields](../../study-results/Amp/2026-11-14%20mcp%20server%20fields.md)"
      - "[2026-11-14 remote server fields](../../study-results/Amp/2026-11-14%20remote%20server%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The MCP and skills pages list the keys of a remote server entry.
  - hasEvidenceItems:
      - "[2026-11-14 streamable HTTP with SSE fallback](../../study-results/Amp/2026-11-14%20streamable%20HTTP%20with%20SSE%20fallback.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: A 2025 announcement says remote servers use streamable HTTP by default.
reportedIn:
  - "[Amp docs MCP](../../documents/ampcode.com/Amp%20docs%20MCP.md)"
  - "[Amp docs Skills](../../documents/ampcode.com/Amp%20docs%20Skills.md)"
  - "[Amp news Streamable Transport for MCP](../../documents/ampcode.com/Amp%20news%20Streamable%20Transport%20for%20MCP.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Streamable HTTP transport keys](../../subjects/mcp/Streamable%20HTTP%20transport%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

