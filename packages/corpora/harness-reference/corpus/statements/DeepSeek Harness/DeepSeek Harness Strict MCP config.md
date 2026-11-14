---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: mcp/strict-config
  object:
    supported: partial
    config_argv:
      - "--patch"
      - "{file}"
    basis: omitted-from-help
    note: "A --patch overlay can insert an MCP client row for one run. It is applied after the profile and home patch layers, and the launcher help lists no option that skips those layers."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh mcp overlay with patch](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20mcp%20overlay%20with%20patch.md)"
      - "[2026-11-14 dsh profile patch layer order](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20profile%20patch%20layer%20order.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The MCP guide passes a server as a --patch overlay, and the CLI reference gives the layer order."
  - hasEvidenceItems:
      - "[2026-11-14 dsh launcher help options](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20launcher%20help%20options.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The launcher help has --patch and no option that drops the user layers. Absence in a source listing is moderate."
reportedIn:
  - "[deepseek-ai deepseek-harness mcp-memory guide at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20mcp-memory%20guide%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness apps cli reference README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20apps%20cli%20reference%20README%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness cli-help.md at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20cli-help.md%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Strict MCP config](../../subjects/mcp/Strict%20MCP%20config.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
