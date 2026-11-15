---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: skills/plugin-root-variable
  object:
    variables:
      - ${CURSOR_PLUGIN_ROOT}
      - ${CLAUDE_PLUGIN_ROOT}
    substituted_in:
      - command
      - args
      - env values
      - cwd
    context: mcp.json
    not_expanded:
      - ${PLUGIN_ROOT}
      - ${PLUGIN_DATA}
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Cursor Plugin root variable](../../study-results/Cursor/2026-11-04%20Cursor%20Plugin%20root%20variable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs plugin root variable](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20plugin%20root%20variable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "Docs: use ${CURSOR_PLUGIN_ROOT} for the plugin root."
reportedIn:
  - "[Cursor docs Plugins reference cursor.com](../../documents/cursor.com/Cursor%20docs%20Plugins%20reference%20cursor.com.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Plugin root variable](../../subjects/skills/Plugin%20root%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is any plugin root variable substituted in a skill body or in hooks config?
imported_from: fact:skills/plugin-root-variable@cursor#scope-[null,null,null]
---

Imported from `facts/cursor/skills/plugin-root-variable.md`.

Open questions:
- Is any plugin root variable substituted in a skill body or in hooks config?

Rechecked 2026-11-09 against the installed CLI and vendor docs.
