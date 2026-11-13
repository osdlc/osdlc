---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/plugin-root-variable
  object:
    variable: PLUGIN_ROOT
    resolves_to: installed plugin root
    also_set: CLAUDE_PLUGIN_ROOT and CLAUDE_PLUGIN_DATA for compatibility
    documented_use: lifecycle hook commands, for example ${PLUGIN_ROOT}/hooks/session_start.py
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Codex CLI Plugin root variable](../../study-results/Codex%20CLI/2026-11-04%20Codex%20CLI%20Plugin%20root%20variable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Codex docs build plugins](../../documents/developers.openai.com/Codex%20docs%20build%20plugins.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Plugin root variable](../../subjects/skills/Plugin%20root%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is ${PLUGIN_ROOT} substituted in SKILL.md bodies or in plugin MCP config, or only in hook commands?
imported_from: fact:skills/plugin-root-variable@codex#scope-[null,null,null]
---

Imported from `facts/codex/skills/plugin-root-variable.md`.

Open questions:
- Is ${PLUGIN_ROOT} substituted in SKILL.md bodies or in plugin MCP config, or only in hook commands?
