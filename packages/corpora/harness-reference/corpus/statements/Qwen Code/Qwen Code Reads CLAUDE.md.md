---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: instructions/claude-md
  object:
    supported: false
    basis: undocumented
    note: the default context file names are QWEN.md and AGENTS.md; the `context.fileName` setting can name other files
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Context filename constants source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Context%20filename%20constants%20source.md)"
      - "[2026-11-14 Qwen Code Context filenames default source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Context%20filenames%20default%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at v0.27.3: the default list of context file names holds QWEN.md and AGENTS.md only (absence)"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Context fileName setting docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Context%20fileName%20setting%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: "docs at v0.27.3: the file name is configurable"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Reads CLAUDE.md](../../subjects/instructions/Reads%20CLAUDE.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

CLAUDE.md is not in the default list of context file names. A user can add it with `context.fileName`.
