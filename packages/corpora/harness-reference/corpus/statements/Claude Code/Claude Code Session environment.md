---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/session-env
  object:
    vars:
      - CLAUDE_CODE_SESSION_ID
      - CLAUDE_PID
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-10 Claude Code Session environment](../../study-results/Claude%20Code/2026-10-10%20Claude%20Code%20Session%20environment.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: run observed 2026-10-10.
  - hasEvidenceItems:
      - "[2026-11-09 docs env CLAUDECODE](../../study-results/Claude%20Code/2026-11-09%20docs%20env%20CLAUDECODE.md)"
    directionOfEvidenceProvided: neutral
    description: CLAUDECODE=1 is also exported to the same subprocesses.
reportedIn:
  - "[Claude Code harness notes for a dispatcher](../../documents/skillwright/Claude%20Code%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-10T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Session environment](../../subjects/cli/Session%20environment.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:cli/session-env@claude-code#scope-[null,null,null]
open:
  - The docs also list CLAUDECODE and CLAUDE_CODE_CHILD_SESSION as exported to the commands Claude Code runs; the 2026-10-10 run recorded only CLAUDE_CODE_SESSION_ID and CLAUDE_PID.
---

Imported from `facts/claude-code/cli/session-env.md`.
