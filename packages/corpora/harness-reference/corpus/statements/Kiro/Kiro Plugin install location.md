---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: plugins/install-location
  object:
    path: ~/.kiro/powers/installed/<name>
    detail: The permissions page names ~/.kiro/powers/installed/<name>/mcp.json as the MCP configuration of an installed Power. The docs do not say whether a local power is copied there.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro installed power path](../../study-results/Kiro/2026-11-14%20kiro%20installed%20power%20path.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the path of an installed power's mcp.json."
reportedIn:
  - "[Kiro docs Permissions](../../documents/kiro.dev/Kiro%20docs%20Permissions.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Plugin install location](../../subjects/plugins/Plugin%20install%20location.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Kiro Plugin install location open](Kiro%20Plugin%20install%20location%20open.md)"
open:
  - "Is a local power or plugin folder copied to the install location or used in place?"
---
