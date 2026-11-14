---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: permissions/tool-rules
  object:
    supported: true
    config_key: amp.tools.disable / amp.tools.enable
    syntax: tool names with * globs; builtin:<name> disables only the built-in tool of that name
    note: Set in a settings file; the docs name no command-line flag. amp.mcpPermissions allows or rejects MCP servers by pattern, first matching rule wins. A plugin can approve or reject single tool calls.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 tools disable setting](../../study-results/Amp/2026-11-14%20tools%20disable%20setting.md)"
      - "[2026-11-14 tools enable and disable in managed settings](../../study-results/Amp/2026-11-14%20tools%20enable%20and%20disable%20in%20managed%20settings.md)"
      - "[2026-11-14 sdk enabledTools maps to tools enable](../../study-results/Amp/2026-11-14%20sdk%20enabledTools%20maps%20to%20tools%20enable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The configuration page and SDK reference name the two settings.
  - hasEvidenceItems:
      - "[2026-11-14 mcp permissions setting](../../study-results/Amp/2026-11-14%20mcp%20permissions%20setting.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The configuration page describes the MCP server rules.
  - hasEvidenceItems:
      - "[2026-11-14 tool control by plugin](../../study-results/Amp/2026-11-14%20tool%20control%20by%20plugin.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The tools page points at plugins for tool control.
reportedIn:
  - "[Amp docs Configuration](../../documents/ampcode.com/Amp%20docs%20Configuration.md)"
  - "[Amp docs SDK TypeScript](../../documents/ampcode.com/Amp%20docs%20SDK%20TypeScript.md)"
  - "[Amp docs Tools](../../documents/ampcode.com/Amp%20docs%20Tools.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

