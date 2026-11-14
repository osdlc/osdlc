---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: config/config-dir-env
  object:
    supported: true
    var: KIRO_HOME
    replaces: ~/.kiro
    sets:
      - MCP configuration and sign-ins
      - permissions
      - sessions
      - Powers
      - settings
      - custom agents
      - Skills
      - Steering
      - Workflows
      - other V3 agent state
    note: Must be an absolute path; a filesystem root, the home directory, one of its ancestors or a relative path falls back to ~/.kiro. The settings reference describes it for V3.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro KIRO_HOME in the CLI reference](../../study-results/Kiro/2026-11-14%20kiro%20KIRO_HOME%20in%20the%20CLI%20reference.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: what the variable moves."
  - hasEvidenceItems:
      - "[2026-11-14 kiro KIRO_HOME in the settings reference](../../study-results/Kiro/2026-11-14%20kiro%20KIRO_HOME%20in%20the%20settings%20reference.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: values that fall back to the default."
reportedIn:
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
  - "[Kiro docs Settings reference](../../documents/kiro.dev/Kiro%20docs%20Settings%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Config directory variable](../../subjects/config/Config%20directory%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
