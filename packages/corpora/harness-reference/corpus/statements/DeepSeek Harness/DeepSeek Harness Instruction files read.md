---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: instructions/files
  object:
    files:
      - AGENTS.md
      - CLAUDE.md
      - AGENTS.local.md
      - CLAUDE.local.md
      - $DSH_HOME/AGENTS.md
    walk: git root down to the cwd
    budget: 64 KiB
    not_read: DEEPSEEK.md
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-08 DeepSeek Harness Instruction files read](../../study-results/DeepSeek%20Harness/2026-10-08%20DeepSeek%20Harness%20Instruction%20files%20read.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-08.
reportedIn:
  - "[DeepSeek Harness (dsh) harness notes for a dispatcher](../../documents/skillwright/DeepSeek%20Harness%20%28dsh%29%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-08T00:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Instruction files read](../../subjects/instructions/Instruction%20files%20read.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:instructions/files@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/instructions/files.md`.
