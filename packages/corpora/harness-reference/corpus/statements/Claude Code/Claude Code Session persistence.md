---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/session-persistence
  object:
    supported: true
    persists_by_default: true
    disable_argv:
      - --no-session-persistence
    disable_env:
      CLAUDE_CODE_SKIP_PROMPT_HISTORY: "1"
    note: --no-session-persistence works with --print only; the environment variable works in any mode.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 docs cli no-session-persistence](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20no-session-persistence.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference names the environment variable that does the same in any mode.
  - hasEvidenceItems:
      - "[2026-11-09 docs env SKIP_PROMPT_HISTORY](../../study-results/Claude%20Code/2026-11-09%20docs%20env%20SKIP_PROMPT_HISTORY.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The variable skips writing prompt history and transcripts.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Session persistence](../../subjects/cli/Session%20persistence.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - The transcript store ~/.claude/projects/<project>/<session>.jsonl is from the claude directory page, which no study result here quotes; cite it before relying on `store`.
---
