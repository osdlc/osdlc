---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: skills/plugin-root-variable
  object:
    variable: ${PLUGIN_ROOT} with aliases ${CLAUDE_PLUGIN_ROOT} and ${COPILOT_PLUGIN_ROOT}
    substituted_in: stdio MCP server args, env values and cwd; LSP cwd and script paths
    not_in: remote http/sse/streamable-http values
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 GitHub Copilot CLI Plugin root variable](../../study-results/GitHub%20Copilot%20CLI/2026-11-04%20GitHub%20Copilot%20CLI%20Plugin%20root%20variable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Copilot docs CLI plugin reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20plugin%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Plugin root variable](../../subjects/skills/Plugin%20root%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is the variable substituted in SKILL.md bodies?
imported_from: fact:skills/plugin-root-variable@copilot-cli#scope-[null,null,null]
---

Imported from `facts/copilot-cli/skills/plugin-root-variable.md`.

Open questions:
- Is the variable substituted in SKILL.md bodies?
