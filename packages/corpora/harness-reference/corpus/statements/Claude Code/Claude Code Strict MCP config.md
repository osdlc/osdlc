---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: mcp/strict-config
  object:
    supported: true
    config_argv:
      - --mcp-config
      - "{file}"
    strict_argv:
      - --strict-mcp-config
    ignores:
      - all other MCP configurations
    inline_json: true
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 help mcp config](../../study-results/Claude%20Code/2026-11-09%20help%20mcp%20config.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --mcp-config loads servers from JSON files or strings.
  - hasEvidenceItems:
      - "[2026-11-09 docs cli strict mcp](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20strict%20mcp.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference repeats it.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Strict MCP config](../../subjects/mcp/Strict%20MCP%20config.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
