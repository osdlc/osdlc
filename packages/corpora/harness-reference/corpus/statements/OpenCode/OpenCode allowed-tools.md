---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skill-frontmatter/allowed-tools
  object:
    supported: false
    basis: undocumented
    note: the skill parser reads only name, description, metadata and disable-model-invocation
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skill-file frontmatter schema source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill-file%20frontmatter%20schema%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The frontmatter schema the skill parser decodes has four keys and allowed-tools is not one. A listing that lacks an option is evidence of absence, one step below its kind.
reportedIn:
  - "[OpenCode source config plugin skill-file.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill-file.ts%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[allowed-tools](../../subjects/skill-frontmatter/allowed-tools.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

Read from `skill-file.ts` at v2.3.0.
