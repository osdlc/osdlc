---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: mcp/strict-config
  object:
    supported: partial
    config_argv:
      - --mcp-config
      - "{file}"
    inline_json: true
    strict_argv:
      - --allowed-mcp-server-names
      - "{name}"
    note: --mcp-config takes a JSON file path or inline JSON; --allowed-mcp-server-names names the allowed servers; --safe-mode disables MCP servers along with other customizations
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code MCP config option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20MCP%20config%20option%20source.md)"
      - "[2026-11-09 Qwen Code Allowed MCP server names option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Allowed%20MCP%20server%20names%20option%20source.md)"
      - "[2026-11-09 Qwen Code Safe mode option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Safe%20mode%20option%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: option source at v0.27.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Strict MCP config](../../subjects/mcp/Strict%20MCP%20config.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Whether --mcp-config replaces or merges with settings.json servers was not checked.
---
