---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/fork
  object:
    supported: true
    flags: --resume <id> --fork-session
    note: Also with -c/--continue. --session-id <uuid> names the fork. In the TUI, /fork branches the current session.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli fork-session flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20fork-session%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The argument definition of --fork-session.
  - hasEvidenceItems:
      - "[2026-11-14 grok fork session row](../../study-results/Grok%20Build/2026-11-14%20grok%20fork%20session%20row.md)"
      - "[2026-11-14 grok fork command](../../study-results/Grok%20Build/2026-11-14%20grok%20fork%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless and sessions guides.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
  - "[Grok Build user guide Sessions](../../documents/github.com/Grok%20Build%20user%20guide%20Sessions.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Fork a session](../../subjects/cli/Fork%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
