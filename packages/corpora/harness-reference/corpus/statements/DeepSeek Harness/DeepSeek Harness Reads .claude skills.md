---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skills/claude-dir
  object:
    supported: false
    basis: undocumented
    note: The local provider scans .dsh/skills and .agents/skills in the project. A customSkillDirs entry can add another directory.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh skill roots in source](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20roots%20in%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "roots() builds the project roots from .dsh/skills and .agents/skills only. Absence in source is moderate."
  - hasEvidenceItems:
      - "[2026-11-14 dsh skill roots table](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20roots%20table.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: "The skills doc table of roots has no .claude/skills. Absence in docs is weak."
reportedIn:
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness skills subsystem doc at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skills%20subsystem%20doc%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Reads .claude skills](../../subjects/skills/Reads%20.claude%20skills.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
