---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: skills/plugin-namespace
  object:
    runtime_name: review
    namespace: none; a plugin registers each skill under the id it passes to the skill editor
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode skill editor add source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20skill%20editor%20add%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The skill editor stores an added skill under the id it was given, with no prefix.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugin docs skill transform v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20skill%20transform%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The server plugin page shows a plugin adding a skill with an id of its own choice.
reportedIn:
  - "[OpenCode source core skill.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20core%20skill.ts%20at%20a6b15d3.md)"
  - "[OpenCode docs source Build plugins server at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20Build%20plugins%20server%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Plugin skill runtime name](../../subjects/skills/Plugin%20skill%20runtime%20name.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

From source and the build-plugins docs at v2.3.0.
