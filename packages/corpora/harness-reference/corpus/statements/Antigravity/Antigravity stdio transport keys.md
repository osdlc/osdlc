---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: mcp/stdio
  object:
    supported: true
    address_key: command
    also: args, env, cwd
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 mcp transport property](../../study-results/Antigravity/2026-11-14%20mcp%20transport%20property.md)"
      - "[2026-11-14 mcp stdio keys](../../study-results/Antigravity/2026-11-14%20mcp%20stdio%20keys.md)"
      - "[2026-11-14 mcp stdio env key](../../study-results/Antigravity/2026-11-14%20mcp%20stdio%20env%20key.md)"
      - "[2026-11-14 mcp stdio cwd key](../../study-results/Antigravity/2026-11-14%20mcp%20stdio%20cwd%20key.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The MCP page lists the properties of a server entry.
reportedIn:
  - "[Antigravity docs MCP](../../documents/antigravity.google/Antigravity%20docs%20MCP.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[stdio transport keys](../../subjects/mcp/stdio%20transport%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

An entry with `command` is a local stdio server. The docs name no `type` key.
