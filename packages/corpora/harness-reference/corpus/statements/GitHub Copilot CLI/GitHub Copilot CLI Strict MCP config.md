---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: mcp/strict-config
  object:
    supported: partial
    config_argv:
      - --additional-mcp-config
      - "@{file}"
    inline_json: true
    strict_argv:
      - --disable-builtin-mcps
    note: the flag adds servers for one session and augments ~/.copilot/mcp-config.json; --disable-builtin-mcps switches off the built-in github-mcp-server, and --disable-mcp-server=NAME a named server
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 GitHub Copilot CLI Additional MCP config detail docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Additional%20MCP%20config%20detail%20docs.md)"
      - "[2026-11-09 GitHub Copilot CLI Disable builtin MCPs option docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Disable%20builtin%20MCPs%20option%20docs.md)"
      - "[2026-11-09 GitHub Copilot CLI Disable MCP server option docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Disable%20MCP%20server%20option%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: command reference.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Strict MCP config](../../subjects/mcp/Strict%20MCP%20config.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
