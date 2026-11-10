---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: plugins/install-location
  object:
    marketplace_plugins: ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>
    root_override: CLAUDE_CODE_PLUGIN_CACHE_DIR
    local_plugin: --plugin-dir and skills-directory plugins load in place, never copied
    local_marketplace_relative_path: loads in place from the marketplace folder
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Plugin install location](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Plugin%20install%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Plugin install location 2](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Plugin%20install%20location%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Plugin install location 3](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Plugin%20install%20location%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Claude Code docs plugin loading reference](../../documents/code.claude.com/Claude%20Code%20docs%20plugin%20loading%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Plugin install location](../../subjects/plugins/Plugin%20install%20location.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/install-location@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/plugins/install-location.md`.
