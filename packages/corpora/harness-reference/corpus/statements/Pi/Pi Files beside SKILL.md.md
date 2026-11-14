---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: skills/bundled-files
  object:
    auto_loaded: false
    seen_on_load: the SKILL.md body and the skill directory path
    access: the model reads them with its own tools, resolving relative paths against the skill directory
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill command block](../../study-results/Pi/2026-11-14%20Pi%20skill%20command%20block.md)"
      - "[2026-11-14 Pi skill prompt entry fields](../../study-results/Pi/2026-11-14%20Pi%20skill%20prompt%20entry%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: /skill:name inserts only the SKILL.md body and the directory; the system prompt holds only name, description and location.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs skill bundled files](../../study-results/Pi/2026-11-14%20Pi%20docs%20skill%20bundled%20files.md)"
      - "[2026-11-14 Pi docs skill startup contents](../../study-results/Pi/2026-11-14%20Pi%20docs%20skill%20startup%20contents.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Skills page.
reportedIn:
  - "[Pi source agent-session.ts at v1.5.2](../../documents/github.com/Pi%20source%20agent-session.ts%20at%20v1.5.2.md)"
  - "[Pi source skills.ts at v1.5.2](../../documents/github.com/Pi%20source%20skills.ts%20at%20v1.5.2.md)"
  - "[Pi docs Skills at v1.5.2](../../documents/github.com/Pi%20docs%20Skills%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Files beside SKILL.md](../../subjects/skills/Files%20beside%20SKILL.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Pi Files beside SKILL.md open](Pi%20Files%20beside%20SKILL.md%20open.md)"
---

Neither load path reads any file but SKILL.md.
