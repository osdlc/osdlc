---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: instructions/files
  object:
    files:
      - QWEN.md
      - AGENTS.md
      - .qwen/QWEN.local.md
    note: QWEN.md and AGENTS.md are the default context file names, which a setting can replace. `.qwen/QWEN.local.md` at the project root is one fixed slot for a developer's own instructions, loaded after the other project context files and not searched for in parent directories.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Context filename constants source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Context%20filename%20constants%20source.md)"
      - "[2026-11-14 Qwen Code Context filenames default source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Context%20filenames%20default%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: memory-constants.ts at v0.27.3 sets the default context file names to QWEN.md and AGENTS.md.
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Local context filename source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Local%20context%20filename%20source.md)"
      - "[2026-11-14 Qwen Code Local context file slot source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Local%20context%20file%20slot%20source.md)"
      - "[2026-11-14 Qwen Code Local context file not in upward search source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Local%20context%20file%20not%20in%20upward%20search%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The same file defines QWEN.local.md, anchored at <projectRoot>/.qwen/QWEN.local.md and loaded from one fixed slot.
reportedIn:
  - "[Qwen Code source memory-constants.ts at ddeba2f](../../documents/github.com/Qwen%20Code%20source%20memory-constants.ts%20at%20ddeba2f.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Instruction files read](../../subjects/instructions/Instruction%20files%20read.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Qwen Code Instruction files read](Qwen%20Code%20Instruction%20files%20read.md)"
---

The 2026-08-08 statement listed QWEN.md and AGENTS.md from a third-party note. The source at v0.27.3 confirms both and adds a per-developer file, `.qwen/QWEN.local.md`. The loader that reads the slot was not read; the value rests on the constants and their comment.
