---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: mcp/config-file
  object:
    file: .agents/mcp_config.json
    url_key: serverUrl
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-09 Antigravity MCP config file](../../study-results/Antigravity/2026-10-09%20Antigravity%20MCP%20config%20file.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-10-09.
  - hasEvidenceItems:
      - "[2026-11-09 mcp config locations](../../study-results/Antigravity/2026-11-09%20mcp%20config%20locations.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[Antigravity docs MCP](../../documents/antigravity.google/Antigravity%20docs%20MCP.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-09T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[MCP config file](../../subjects/mcp/MCP%20config%20file.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Which transports .agents/mcp_config.json supports, and whether serverUrl selects streamable HTTP or SSE.
imported_from: fact:mcp/config-file@antigravity#scope-[null,null,null]
---

Imported from `facts/antigravity/mcp/config-file.md`.

Open questions:
- Which transports .agents/mcp_config.json supports, and whether serverUrl selects streamable HTTP or SSE.
