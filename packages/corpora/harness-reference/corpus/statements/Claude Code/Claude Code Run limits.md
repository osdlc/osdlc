---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/limits
  object:
    supported: true
    max_turns:
      argv:
        - --max-turns
        - "{n}"
      env: CLAUDE_CODE_MAX_TURNS
    max_budget:
      argv:
        - --max-budget-usd
        - "{usd}"
    on_limit: "budget: the run stops once estimated spend reaches the cap"
    note: Both flags work in print mode only. The docs list --max-turns and say --help does not list every flag.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 docs cli max-turns](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20max-turns.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference documents --max-turns, print mode only.
  - hasEvidenceItems:
      - "[2026-11-09 docs cli max-budget](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20max-budget.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference describes the budget cap.
  - hasEvidenceItems:
      - "[2026-11-09 docs cli help not exhaustive](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20help%20not%20exhaustive.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs say a flag missing from --help may still be available.
  - hasEvidenceItems:
      - "[2026-11-09 docs env MAX_TURNS](../../study-results/Claude%20Code/2026-11-09%20docs%20env%20MAX_TURNS.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: CLAUDE_CODE_MAX_TURNS is equivalent to --max-turns.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Run limits](../../subjects/cli/Run%20limits.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What exit code or result subtype does a run report when --max-turns or the budget cap ends it?
  - The 2.1.319 `claude --help` output does not list --max-turns; is that a docs/help gap or is the flag hidden on purpose?
  - Is there a wall-time limit flag? None was found in the help or the quoted docs.
---
