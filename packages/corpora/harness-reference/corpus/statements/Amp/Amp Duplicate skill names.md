---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: skills/duplicate-names
  object:
    winner: first in precedence order
    order:
      - ~/.config/agents/skills
      - ~/.agents/skills
      - ~/.config/amp/skills
      - .agents/skills (project and searched parents)
      - .claude/skills (those directories)
      - ~/.claude/skills
      - ~/.claude/plugins/cache
      - amp.skills.path directories
      - personal skills repository
      - workspace skills repository
      - official Amp skills
    plugin_skills: qualified as <plugin-name>:<skill-name>, so they do not compete with bare names
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Amp Duplicate skill names](../../study-results/Amp/2026-11-04%20Amp%20Duplicate%20skill%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Amp Duplicate skill names 2](../../study-results/Amp/2026-11-04%20Amp%20Duplicate%20skill%20names%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Amp docs Skills](../../documents/ampcode.com/Amp%20docs%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Duplicate skill names](../../subjects/skills/Duplicate%20skill%20names.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/duplicate-names@amp#scope-[null,null,null]
---

Imported from `facts/amp/skills/duplicate-names.md`.
