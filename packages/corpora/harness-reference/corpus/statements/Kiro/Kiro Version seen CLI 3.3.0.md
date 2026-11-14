---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: meta/version-seen
  object:
    version: 3.3.0
    context: CLI, first entry of the CLI changelog, dated 2026-11-12
    ide_version: 1.4.178
    observed: 2026-11-14
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli changelog 3.3.0](../../study-results/Kiro/2026-11-14%20kiro%20cli%20changelog%203.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI changelog on kiro.dev starts with 3.3.0, dated Nov 12, 2026.
  - hasEvidenceItems:
      - "[2026-11-14 kiro ide changelog 1.4.178](../../study-results/Kiro/2026-11-14%20kiro%20ide%20changelog%201.4.178.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The IDE changelog on kiro.dev starts with 1.4.178, dated Nov 12, 2026.
reportedIn:
  - "[Kiro CLI changelog](../../documents/AWS/Kiro%20CLI%20changelog.md)"
  - "[Kiro IDE changelog](../../documents/AWS/Kiro%20IDE%20changelog.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Version seen](../../subjects/meta/Version%20seen.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Kiro Version seen 1.0.288](Kiro%20Version%20seen%201.0.288.md)"
---

Kiro numbers the CLI and the IDE apart. `version` holds the CLI release, since the harness record names the CLI command, and `ide_version` the IDE release of the same day. The 2026-08-08 statement recorded IDE 1.0.288 from a third-party note.
