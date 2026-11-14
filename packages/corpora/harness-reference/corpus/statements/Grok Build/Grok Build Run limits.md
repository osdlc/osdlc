---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/limits
  object:
    supported: partial
    max_turns:
      argv:
        - --max-turns
        - "{n}"
    on_limit: the docs list a max_turn_requests stop reason and an error_max_turns result subtype; the StopCancelled hook fires on the --max-turns limit
    note: Turns only. --max-turns is headless only. The headless guide says grok has no budget feature.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli max-turns flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20max-turns%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The argument definition of --max-turns.
  - hasEvidenceItems:
      - "[2026-11-14 grok max turns row](../../study-results/Grok%20Build/2026-11-14%20grok%20max%20turns%20row.md)"
      - "[2026-11-14 grok no budget feature](../../study-results/Grok%20Build/2026-11-14%20grok%20no%20budget%20feature.md)"
      - "[2026-11-14 grok stop reasons](../../study-results/Grok%20Build/2026-11-14%20grok%20stop%20reasons.md)"
      - "[2026-11-14 grok hook max turns](../../study-results/Grok%20Build/2026-11-14%20grok%20hook%20max%20turns.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless and hooks guides.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
  - "[Grok Build user guide Hooks](../../documents/github.com/Grok%20Build%20user%20guide%20Hooks.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Run limits](../../subjects/cli/Run%20limits.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A cap on turns is the only run limit found. No source was found for a wall-time limit on a run, so none is recorded.
