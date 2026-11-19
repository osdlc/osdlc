---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: mcp/strict-config
  object:
    supported: false
    note: --strict-config only rejects fields of config.toml that this version does not recognise; it does not restrict which MCP servers load.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Strict MCP config help](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Strict%20MCP%20config%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "help-text observed 2026-11-09 at 0.162.0: the only strict flag concerns config fields; codex mcp add has no ignore-other-servers option (absence)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Strict MCP config](../../subjects/mcp/Strict%20MCP%20config.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
