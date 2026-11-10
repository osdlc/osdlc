---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: mcp/config-file
  object:
    file: settings.json
    key: amp.mcpServers
    format: JSON
direction: supports
strength: weak
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Amp MCP config file](../../study-results/Amp/2026-08-08%20Amp%20MCP%20config%20file.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-08-08T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[MCP config file](../../subjects/mcp/MCP%20config%20file.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Which keys select each MCP transport.
imported_from: fact:mcp/config-file@amp#scope-[null,null,null]
---

Imported from `facts/amp/mcp/config-file.md`.

Open questions:
- Which keys select each MCP transport.
