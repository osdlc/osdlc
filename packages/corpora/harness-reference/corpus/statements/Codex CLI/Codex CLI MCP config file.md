---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: mcp/config-file
  object:
    file: config.toml
    key: "[mcp_servers]"
    format: TOML
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Codex CLI MCP config file](../../study-results/Codex%20CLI/2026-08-08%20Codex%20CLI%20MCP%20config%20file.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI MCP config file source](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20MCP%20config%20file%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
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
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[MCP config file](../../subjects/mcp/MCP%20config%20file.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:mcp/config-file@codex#scope-[null,null,null]
---

Imported from `facts/codex/mcp/config-file.md`.
