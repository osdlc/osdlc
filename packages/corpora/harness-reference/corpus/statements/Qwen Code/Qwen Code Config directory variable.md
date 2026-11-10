---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: config/config-dir-env
  object:
    supported: true
    var: QWEN_HOME
    replaces: ~/.qwen
    sets:
      - credentials
      - settings
      - memory
      - skills
    note: project-level .qwen directories are unaffected
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code QWEN_HOME source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20QWEN_HOME%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: storage source at v0.27.0.
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code QWEN_HOME docs](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20QWEN_HOME%20docs.md)"
      - "[2026-11-09 Qwen Code QWEN_HOME scope docs](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20QWEN_HOME%20scope%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: settings docs.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Config directory variable](../../subjects/config/Config%20directory%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
