---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: plugins/install
  object:
    commands:
      - claude plugin install <plugin>@<marketplace>
    recorded_in: enabledPlugins in settings.json; user scope writes ~/.claude/settings.json
    sources: plugins from a marketplace; --marketplace installs from one not yet added
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 help install marketplace](../../study-results/Claude%20Code/2026-11-09%20help%20install%20marketplace.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --marketplace installs a bare plugin name from the marketplace at a source, adding it first.
  - hasEvidenceItems:
      - "[2026-11-09 docs pinstall user scope](../../study-results/Claude%20Code/2026-11-09%20docs%20pinstall%20user%20scope.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The entry goes in enabledPlugins in ~/.claude/settings.json for user scope.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
