---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: mcp/config-file
  object:
    file: .cursor/mcp.json
    format: JSON
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs mcp locations](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20mcp%20locations.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Project and global mcp.json locations.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs cli mcp json](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20cli%20mcp%20json.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reads the same mcp.json configuration as the editor.
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
subject: "[MCP config file](../../subjects/mcp/MCP%20config%20file.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:mcp/config-file@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/mcp/config-file.md`.

Rechecked 2026-11-09 against the installed CLI and vendor docs.
