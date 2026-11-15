---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: skills/plugin-root-variable
  object:
    variable: ${PLUGIN_ROOT}
    substituted_in:
      - MCP server args
      - MCP server cwd
      - MCP server env values
    also_env_var: PLUGIN_ROOT for plugin MCP servers
    hooks: not used; hooks run with the plugin root as working directory
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Antigravity Plugin root variable](../../study-results/Antigravity/2026-11-04%20Antigravity%20Plugin%20root%20variable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Antigravity docs Build plugins](../../documents/antigravity.google/Antigravity%20docs%20Build%20plugins.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Plugin root variable](../../subjects/skills/Plugin%20root%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is ${PLUGIN_ROOT} substituted inside a SKILL.md body?
imported_from: fact:skills/plugin-root-variable@antigravity#scope-[null,null,null]
---

Imported from `facts/antigravity/skills/plugin-root-variable.md`.

Open questions:
- Is ${PLUGIN_ROOT} substituted inside a SKILL.md body?
