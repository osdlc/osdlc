---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/continue
  object:
    supported: true
    argv:
      - --continue
    chosen_by: the previous session
    note: "`agent resume` resumes the latest chat session"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help resume continue](../../study-results/Cursor/2026-11-09%20Cursor%20help%20resume%20continue.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --continue in --help.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs resume](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20resume.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "`agent resume` resumes the latest chat."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Continue the last session](../../subjects/cli/Continue%20the%20last%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---



Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
