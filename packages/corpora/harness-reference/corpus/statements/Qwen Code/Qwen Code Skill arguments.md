---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/arguments
  object:
    mechanism: a file the skill reads, named qwen-skill-args-<skill>.txt
    sanitizing: characters outside [A-Za-z0-9._-] become _
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Qwen Code Skill arguments](../../study-results/Qwen%20Code/2026-11-04%20Qwen%20Code%20Skill%20arguments.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Qwen Code docs Skills](../../documents/qwenlm.github.io/Qwen%20Code%20docs%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Skill arguments](../../subjects/skills/Skill%20arguments.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is there an $ARGUMENTS style placeholder, or only the args file?
imported_from: fact:skills/arguments@qwen-code#scope-[null,null,null]
---

Imported from `facts/qwen-code/skills/arguments.md`.

Open questions:
- Is there an $ARGUMENTS style placeholder, or only the args file?
