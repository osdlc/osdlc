---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: skills/prequalified-name
  object:
    behaviour: shown once, not doubled (fixed in 1.2.7)
    example: /acme-tools:review
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 changelog plugin skill double prefix](../../study-results/Antigravity/2026-11-14%20changelog%20plugin%20skill%20double%20prefix.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 1.2.7 changelog fixes the doubled prefix.
reportedIn:
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Pre-qualified skill name](../../subjects/skills/Pre-qualified%20skill%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Before CLI 1.2.7 such a skill got the slash command `/<plugin>:<plugin>:<skill>`.
