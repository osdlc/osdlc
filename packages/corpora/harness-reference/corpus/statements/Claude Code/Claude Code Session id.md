---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/session-id
  object:
    supported: true
    assign_argv:
      - --session-id
      - "{id}"
    format: uuid
    reported_in:
      - result
      - env
    result_field: session_id
    env_var: CLAUDE_CODE_SESSION_ID
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 help session id](../../study-results/Claude%20Code/2026-11-09%20help%20session%20id.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`--session-id <uuid>` assigns the id; it must be a valid UUID."
  - hasEvidenceItems:
      - "[2026-11-09 docs headless session id](../../study-results/Claude%20Code/2026-11-09%20docs%20headless%20session%20id.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs read the id from the json result field session_id.
  - hasEvidenceItems:
      - "[2026-11-09 docs env SESSION_ID](../../study-results/Claude%20Code/2026-11-09%20docs%20env%20SESSION_ID.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: CLAUDE_CODE_SESSION_ID carries the id in tool, hook and stdio MCP subprocesses.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Session id](../../subjects/cli/Session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
