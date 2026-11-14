---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skills/name-validation
  object:
    checks: the name is not empty and holds no `/`
    blocking: true
    colon_allowed: true
    must_match_directory: false
    rejects_only: an empty name or one with a `/`
    note: "Skills created through goose get a stricter rule: at most 64 characters of lowercase letters, digits and hyphens, with no hyphen at either end."
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose skill missing name skipped](../../study-results/goose/2026-11-14%20goose%20skill%20missing%20name%20skipped.md)"
      - "[2026-11-14 goose skill name with slash skipped](../../study-results/goose/2026-11-14%20goose%20skill%20name%20with%20slash%20skipped.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Discovery skips a skill with an empty name or a slash in it, and checks nothing else.
  - hasEvidenceItems:
      - "[2026-11-14 goose open plugins namespaced name](../../study-results/goose/2026-11-14%20goose%20open%20plugins%20namespaced%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Plugin skill names hold a colon.
  - hasEvidenceItems:
      - "[2026-11-14 goose skill create name rule](../../study-results/goose/2026-11-14%20goose%20skill%20create%20name%20rule.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: validate_skill_name is the stricter rule for created skills.
reportedIn:
  - "[aaif-goose goose goose-agent skills discovery.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-agent%20skills%20discovery.rs%20at%202365bc5.md)"
  - "[aaif-goose goose open_plugins.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20open_plugins.rs%20at%202365bc5.md)"
  - "[aaif-goose goose skills mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skills%20mod.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

When loading, goose rejects only an empty name or one with a `/`; such a skill is skipped.
