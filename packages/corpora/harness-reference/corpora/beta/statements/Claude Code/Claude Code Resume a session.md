---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/resume
  object:
    supported: true
    flags: -r/--resume <id> "<prompt>"
    picker: with no id
    from_pr: --from-pr [value]
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-09-25 Claude Code Resume a session](../../study-results/Claude%20Code/2026-09-25%20Claude%20Code%20Resume%20a%20session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-09-25.
  - hasEvidenceItems:
      - "[2026-11-09 help resume](../../study-results/Claude%20Code/2026-11-09%20help%20resume.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: -r, --resume takes an id or name, or opens a picker.
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
subject: "[Resume a session](../../subjects/cli/Resume%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/resume@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/cli/resume.md`.
