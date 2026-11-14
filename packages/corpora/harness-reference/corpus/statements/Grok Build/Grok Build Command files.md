---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: commands/files
  object:
    supported: true
    note: Flat *.md files in a commands directory (.grok/commands, ~/.grok/commands and the .claude equivalents) become user-invocable slash commands named after the file stem. The docs call this the legacy layout; skills are the main form.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok command file scan](../../study-results/Grok%20Build/2026-11-14%20grok%20command%20file%20scan.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Discovery scans a commands subdirectory for .md files.
  - hasEvidenceItems:
      - "[2026-11-14 grok command files](../../study-results/Grok%20Build/2026-11-14%20grok%20command%20files.md)"
      - "[2026-11-14 grok command dirs row](../../study-results/Grok%20Build/2026-11-14%20grok%20command%20dirs%20row.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills guide.
reportedIn:
  - "[xai-org grok-build skills discovery.rs](../../documents/github.com/xai-org%20grok-build%20skills%20discovery.rs.md)"
  - "[Grok Build user guide Skills](../../documents/github.com/Grok%20Build%20user%20guide%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Command files](../../subjects/commands/Command%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
