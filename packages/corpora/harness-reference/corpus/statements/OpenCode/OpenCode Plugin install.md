---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/install
  object:
    commands:
      - opencode plugin add opencode-acme-plugin@1.2.0
      - opencode plugin add github:acme/opencode-plugin
      - opencode plugin add 'github:acme/plugins#main::path:packages/opencode-plugin'
    sources: npm names with versions, tags or ranges, and npm-compatible git package specs; local directories are listed in plugins directly
    recorded_in: plugins in the global opencode.json(c)
    note: plugins under .opencode/plugins load with no install
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugin add command source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20add%20command%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The add command installs a plugin and adds it to the global configuration.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugins docs manage v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20manage%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs add example v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20add%20example%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs install sources v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20install%20sources%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs git refs v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20git%20refs%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs git examples v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20git%20examples%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs configure v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20configure%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs discover v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20discover%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins page gives the commands, what can be installed, and the directories that load with no install.
reportedIn:
  - "[OpenCode source commands commands.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20commands%20commands.ts%20at%20a6b15d3.md)"
  - "[OpenCode docs source plugins at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20plugins%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

From source and the plugins docs page at v2.3.0.
