---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: config/config-dir-env
  object:
    supported: true
    var: CURSOR_CONFIG_DIR
    note: documented for the CLI config file; XDG_CONFIG_HOME also moves cli-config.json on Linux and BSD
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs config env](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20config%20env.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Docs name CURSOR_CONFIG_DIR.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Config directory variable](../../subjects/config/Config%20directory%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Whether it moves anything beyond cli-config.json was not checked.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
