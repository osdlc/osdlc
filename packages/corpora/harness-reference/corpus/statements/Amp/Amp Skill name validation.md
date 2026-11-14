---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: skills/name-validation
  object:
    checks: the frontmatter name must equal the directory name for skills in a personal or workspace skills repository and for skills a plugin registers
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 repository skill name matches directory](../../study-results/Amp/2026-11-14%20repository%20skill%20name%20matches%20directory.md)"
      - "[2026-11-14 plugin skill name matches directory](../../study-results/Amp/2026-11-14%20plugin%20skill%20name%20matches%20directory.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills and plugins pages state the rule.
reportedIn:
  - "[Amp docs Skills](../../documents/ampcode.com/Amp%20docs%20Skills.md)"
  - "[Amp docs Plugins](../../documents/ampcode.com/Amp%20docs%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The docs do not say what happens when the check fails, or what is checked for a skill in a local directory.
