---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: mcp/strict-config
  object:
    supported: partial
    ignores:
      - workspace MCP configuration
      - user-level MCP configuration
    note: "Through a custom agent selected with --agent <name>: its `mcpServers` field lists the servers, and `includeMcpJson` decides whether the workspace and user mcp.json servers are added (the example in the docs sets it to false)."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro agent mcpServers field](../../study-results/Kiro/2026-11-14%20kiro%20agent%20mcpServers%20field.md)"
      - "[2026-11-14 kiro agent includeMcpJson field](../../study-results/Kiro/2026-11-14%20kiro%20agent%20includeMcpJson%20field.md)"
      - "[2026-11-14 kiro agent includeMcpJson example](../../study-results/Kiro/2026-11-14%20kiro%20agent%20includeMcpJson%20example.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the agent fields, and an example that sets includeMcpJson to false."
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli agent flag](../../study-results/Kiro/2026-11-14%20kiro%20cli%20agent%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the flag that selects an agent."
reportedIn:
  - "[Kiro docs Model Context Protocol](../../documents/kiro.dev/Kiro%20docs%20Model%20Context%20Protocol.md)"
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Strict MCP config](../../subjects/mcp/Strict%20MCP%20config.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
