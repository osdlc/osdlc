---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: skill-frontmatter/name
  object:
    supported: true
    required: false
    max_length: 64
    note: defaults to the folder name; the Build plugins page marks it required for a plugin skill, 1-64 characters, matching the folder
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 skills name field](../../study-results/Antigravity/2026-11-14%20skills%20name%20field.md)"
      - "[2026-11-14 build-plugins skill name field](../../study-results/Antigravity/2026-11-14%20build-plugins%20skill%20name%20field.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page says name is optional; the Build plugins page gives the length for a plugin skill.
  - hasEvidenceItems:
      - "[2026-11-14 changelog validate skills](../../study-results/Antigravity/2026-11-14%20changelog%20validate%20skills.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: agy plugin validate only warns when name is missing.
reportedIn:
  - "[Antigravity docs Agent skills](../../documents/antigravity.google/Antigravity%20docs%20Agent%20skills.md)"
  - "[Antigravity docs Build plugins antigravity.google](../../documents/antigravity.google/Antigravity%20docs%20Build%20plugins%20antigravity.google.md)"
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[name](../../subjects/skill-frontmatter/name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The two pages differ on whether `name` is required. The skills page says no, and `agy plugin validate` treats a missing `name` as a warning, so the value is `required: false`. The 64-character limit is stated for plugin skills.
