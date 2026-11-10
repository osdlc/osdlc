---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/structured-output
  object:
    output: --output-format json|stream-json
    input: --input-format stream-json
    partial: --include-partial-messages
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-09-25 Claude Code Structured output](../../study-results/Claude%20Code/2026-09-25%20Claude%20Code%20Structured%20output.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-09-25.
  - hasEvidenceItems:
      - "[2026-11-09 help output format](../../study-results/Claude%20Code/2026-11-09%20help%20output%20format.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Help text lists --output-format json and stream-json.
reportedIn:
  - "[Claude Code harness notes for a dispatcher](../../documents/skillwright/Claude%20Code%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-09-25T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Structured output](../../subjects/cli/Structured%20output.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/structured-output@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/cli/structured-output.md`.
