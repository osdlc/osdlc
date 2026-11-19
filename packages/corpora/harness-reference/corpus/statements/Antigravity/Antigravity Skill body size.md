---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: skills/body-size
  object:
    cap: 24 KB
    numeric_limit: true
    detail: agy plugin validate warns when a SKILL.md body is over the 24 KB limit
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 changelog validate skills](../../study-results/Antigravity/2026-11-14%20changelog%20validate%20skills.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 1.4.1 changelog names a 24 KB limit on the SKILL.md body.
reportedIn:
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Skill body size](../../subjects/skills/Skill%20body%20size.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Antigravity Skill body size open](Antigravity%20Skill%20body%20size%20open.md)"
open:
  - "What does the loader do with a body over 24 KB: truncate it, as it does a rule file, or skip the skill?"
---

The limit is named in the changelog entry for `agy plugin validate`. The skills page gives no size guidance.
