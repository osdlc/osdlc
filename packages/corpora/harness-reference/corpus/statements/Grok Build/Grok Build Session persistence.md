---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/session-persistence
  object:
    supported: true
    persists_by_default: true
    store: ~/.grok/sessions
    note: No option in the CLI argument definitions turns saving off. With a read-only ~/.grok, session persistence fails silently.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok sessions saved](../../study-results/Grok%20Build/2026-11-14%20grok%20sessions%20saved.md)"
      - "[2026-11-14 grok session id format](../../study-results/Grok%20Build/2026-11-14%20grok%20session%20id%20format.md)"
      - "[2026-11-14 grok sessions dir row](../../study-results/Grok%20Build/2026-11-14%20grok%20sessions%20dir%20row.md)"
      - "[2026-11-14 grok read-only home](../../study-results/Grok%20Build/2026-11-14%20grok%20read-only%20home.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The sessions and headless guides.
  - hasEvidenceItems:
      - "[2026-11-14 grok cli argument list](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20argument%20list.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The argument definitions were read in full and hold no option that turns saving off. A listing can leave an option out, so this counts one step below source.
reportedIn:
  - "[Grok Build user guide Sessions](../../documents/github.com/Grok%20Build%20user%20guide%20Sessions.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Session persistence](../../subjects/cli/Session%20persistence.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
