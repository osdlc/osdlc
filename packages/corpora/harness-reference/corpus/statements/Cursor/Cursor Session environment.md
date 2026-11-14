---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/session-env
  object:
    vars:
      - CURSOR_AGENT
    hook_vars:
      - CURSOR_PROJECT_DIR
      - CURSOR_VERSION
      - CURSOR_USER_EMAIL
      - CURSOR_TRANSCRIPT_PATH
      - CURSOR_CODE_REMOTE
      - CURSOR_PLUGIN_ROOT
      - CLAUDE_PROJECT_DIR
    note: CURSOR_AGENT is documented for shells the agent starts; hook_vars reach hook scripts only
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs CURSOR_AGENT](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20CURSOR_AGENT.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The Terminal page names CURSOR_AGENT.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor docs hook environment variables](../../study-results/Cursor/2026-11-14%20Cursor%20docs%20hook%20environment%20variables.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The Hooks page lists the variables hook scripts receive.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Session environment](../../subjects/cli/Session%20environment.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

No docs page lists any other variable for shell commands the agent runs.
