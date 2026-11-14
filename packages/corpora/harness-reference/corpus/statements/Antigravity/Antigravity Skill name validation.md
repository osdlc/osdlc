---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: skills/name-validation
  object:
    checks: agy plugin validate warns when `name` is missing or does not match its folder
    charset: lowercase, hyphens for spaces
    length: 1-64 characters (plugin skills)
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 changelog validate skills](../../study-results/Antigravity/2026-11-14%20changelog%20validate%20skills.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 1.4.1 changelog lists the name checks of agy plugin validate.
  - hasEvidenceItems:
      - "[2026-11-14 skills name field](../../study-results/Antigravity/2026-11-14%20skills%20name%20field.md)"
      - "[2026-11-14 build-plugins skill name field](../../study-results/Antigravity/2026-11-14%20build-plugins%20skill%20name%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills and Build plugins pages describe the name form.
reportedIn:
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
  - "[Antigravity docs Agent skills](../../documents/antigravity.google/Antigravity%20docs%20Agent%20skills.md)"
  - "[Antigravity docs Build plugins antigravity.google](../../documents/antigravity.google/Antigravity%20docs%20Build%20plugins%20antigravity.google.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does the loader skip a skill whose name fails these checks, or load it anyway?
---

The checks named are those of `agy plugin validate`, which reports them as warnings (`--strict` turns warnings into errors). The sources do not say what the loader does.
