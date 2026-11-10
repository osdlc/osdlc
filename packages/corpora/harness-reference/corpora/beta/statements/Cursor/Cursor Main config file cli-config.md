---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: config/main-file
  object:
    file: ~/.cursor/cli-config.json
    format: JSON
    scope: global; <project>/.cursor/cli.json holds permissions only
    note: CURSOR_CONFIG_DIR moves the directory
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs config file location](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20config%20file%20location.md)"
      - "[2026-11-09 Cursor docs config env](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20config%20env.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: CLI configuration page.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Main config file](../../subjects/config/Main%20config%20file.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Cursor Main config file](Cursor%20Main%20config%20file.md)"
---

Replaces the earlier ".cursor/cli.json and others" with the two documented files.
