---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: mcp/stdio
  object:
    supported: true
    type: stdio
    address_key: command
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Cursor stdio transport keys](../../study-results/Cursor/2026-08-08%20Cursor%20stdio%20transport%20keys.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs mcp transports](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20mcp%20transports.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Docs list stdio, SSE and Streamable HTTP.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-08-08T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[stdio transport keys](../../subjects/mcp/stdio%20transport%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:mcp/stdio@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/mcp/stdio.md`.

Rechecked 2026-11-09 against the installed CLI and vendor docs.
