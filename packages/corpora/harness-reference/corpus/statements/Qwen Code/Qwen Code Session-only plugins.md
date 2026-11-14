---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: plugins/session-load
  object:
    supported: false
    basis: omitted-from-help
    persists: true
    note: "`-e, --extensions` limits a run to named installed extensions; `qwen extensions link <path>` links a local directory, and the link stays"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Extensions option source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extensions%20option%20source.md)"
      - "[2026-11-14 Qwen Code Extensions link source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extensions%20link%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at v0.27.3: the top-level options hold no flag that loads an extension directory for one run (absence); link is a persistent install"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Extensions flag docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Extensions%20flag%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: "docs at v0.27.3: --extensions picks among available extensions"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Session-only plugins](../../subjects/plugins/Session-only%20plugins.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

No top-level option loads an extension from a directory for one session. `--extensions` only narrows the installed set for a run.
