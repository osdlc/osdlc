---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: plugins/install
  object:
    commands:
      - /powers install <name|path>
      - kiro-cli powers install <name|path>
    sources: a power by catalog name, or a local directory that holds plugin.json or POWER.md; the IDE also imports from a public GitHub repository URL
    recorded_in: the local registry
    note: CLI V3. /powers install runs in a local chat session and refreshes it; kiro-cli powers install runs without a chat and takes effect in the next session. Not supported in cloud sessions.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro powers install slash command](../../study-results/Kiro/2026-11-14%20kiro%20powers%20install%20slash%20command.md)"
      - "[2026-11-14 kiro powers install without chat](../../study-results/Kiro/2026-11-14%20kiro%20powers%20install%20without%20chat.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the install commands."
  - hasEvidenceItems:
      - "[2026-11-14 kiro local power directory](../../study-results/Kiro/2026-11-14%20kiro%20local%20power%20directory.md)"
      - "[2026-11-14 kiro power from a github url](../../study-results/Kiro/2026-11-14%20kiro%20power%20from%20a%20github%20url.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: what can be installed."
  - hasEvidenceItems:
      - "[2026-11-14 kiro powers local registry](../../study-results/Kiro/2026-11-14%20kiro%20powers%20local%20registry.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: where an install is recorded."
  - hasEvidenceItems:
      - "[2026-11-14 kiro powers install not in cloud sessions](../../study-results/Kiro/2026-11-14%20kiro%20powers%20install%20not%20in%20cloud%20sessions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: cloud sessions."
reportedIn:
  - "[Kiro docs Install powers kiro.dev](../../documents/kiro.dev/Kiro%20docs%20Install%20powers%20kiro.dev.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
