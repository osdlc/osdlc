---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skill-frontmatter/metadata
  object:
    supported: true
    required: false
    type: any value; only the opencode/autoinvoke key is read
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skill-file frontmatter schema source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill-file%20frontmatter%20schema%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode skill-file autoinvoke source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill-file%20autoinvoke%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The parser decodes metadata as an optional unknown value and reads the opencode/autoinvoke key from it.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skills docs autoinvoke v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skills%20docs%20autoinvoke%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page documents the opencode/autoinvoke key.
reportedIn:
  - "[OpenCode source config plugin skill-file.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill-file.ts%20at%20a6b15d3.md)"
  - "[OpenCode docs source skills at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20skills%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[metadata](../../subjects/skill-frontmatter/metadata.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

From source and the skills docs page at v2.3.0.
