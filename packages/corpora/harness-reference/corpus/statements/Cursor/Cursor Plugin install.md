---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: plugins/install
  object:
    commands:
      - agent plugin marketplace add <gitUrl> [--git-ref <ref>]
      - agent --plugin-dir <path>
    sources: git marketplaces; local plugin directories
    recorded_in: Customize page (project or user scope); ~/.cursor/plugins/local for local development
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help plugin marketplace](../../study-results/Cursor/2026-11-09%20Cursor%20help%20plugin%20marketplace.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: CLI adds a marketplace from a git URL.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs plugin install scope](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20plugin%20install%20scope.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Plugins install at project or user scope.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help plugin](../../study-results/Cursor/2026-11-09%20Cursor%20help%20plugin.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The plugin command manages marketplaces only.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs plugin local](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20plugin%20local.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Local development folder.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The CLI has no `plugin install` command in --help; installing a plugin is done in the app.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
