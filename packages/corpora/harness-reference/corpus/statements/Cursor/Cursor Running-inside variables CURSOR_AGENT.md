---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/current-env
  object:
    supported: true
    vars:
      - name: CURSOR_AGENT
        value: any
        meaning: Cursor is running the shell
    set_by: child-commands
    note: documented for the agent terminal tool; the docs test only that it is non-empty
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs CURSOR_AGENT](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20CURSOR_AGENT.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The Terminal page tells users to test CURSOR_AGENT in their shell config to detect that Cursor is running.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Running-inside variables](../../subjects/cli/Running-inside%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Cursor Running-inside variables](Cursor%20Running-inside%20variables.md)"
open:
  - "Does the Cursor CLI also set CURSOR_TRACE_ID for the commands it runs?"
---

The docs do not give the value. `set_by` is read from the docs placing the test in the shell config of the shell Cursor starts.
