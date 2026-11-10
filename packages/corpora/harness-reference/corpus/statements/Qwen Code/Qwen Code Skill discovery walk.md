---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/discovery-walk
  object:
    symlinks: followed, target can be anywhere
    custom_dirs_nested: a skill nested deeper than the custom directory is not found
    project_dirs:
      - .qwen/skills
      - .agents/skills
    personal_dirs:
      - ~/.qwen/skills
      - ~/.agents/skills
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Qwen Code Skill discovery walk](../../study-results/Qwen%20Code/2026-11-04%20Qwen%20Code%20Skill%20discovery%20walk.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Qwen Code Skill discovery walk 2](../../study-results/Qwen%20Code/2026-11-04%20Qwen%20Code%20Skill%20discovery%20walk%202.md)"
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
subject: "[Skill discovery walk](../../subjects/skills/Skill%20discovery%20walk.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does discovery walk parent directories of the working directory up to a repo root?
imported_from: fact:skills/discovery-walk@qwen-code#scope-[null,null,null]
---

Imported from `facts/qwen-code/skills/discovery-walk.md`.

Open questions:
- Does discovery walk parent directories of the working directory up to a repo root?
