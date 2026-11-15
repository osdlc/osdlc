---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/open-with-id
  object:
    supported: true
    flags: --session-id <uuid> -n <name>
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-09-25 Claude Code Open with a chosen session id](../../study-results/Claude%20Code/2026-09-25%20Claude%20Code%20Open%20with%20a%20chosen%20session%20id.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-09-25.
  - hasEvidenceItems:
      - "[2026-11-09 help session id](../../study-results/Claude%20Code/2026-11-09%20help%20session%20id.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --session-id uses a given UUID.
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
subject: "[Open with a chosen session id](../../subjects/cli/Open%20with%20a%20chosen%20session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/open-with-id@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/cli/open-with-id.md`.
