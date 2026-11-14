---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/continue
  object:
    supported: true
    argv:
      - --continue
    chosen_by: most recent session for the current working directory
    accepts_prompt: true
    note: -c is the short form. --resume with no value also resumes the most recent session for the current directory.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli continue flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20continue%20flag.md)"
      - "[2026-11-14 grok cli resume flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20resume%20flag.md)"
      - "[2026-11-14 grok cli resume flag 2](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20resume%20flag%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The argument definitions of -c/--continue and of --resume with an optional value.
  - hasEvidenceItems:
      - "[2026-11-14 grok continue flag doc](../../study-results/Grok%20Build/2026-11-14%20grok%20continue%20flag%20doc.md)"
      - "[2026-11-14 grok continue with prompt](../../study-results/Grok%20Build/2026-11-14%20grok%20continue%20with%20prompt.md)"
      - "[2026-11-14 grok resume most recent](../../study-results/Grok%20Build/2026-11-14%20grok%20resume%20most%20recent.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless and sessions guides, with an example that passes a prompt.
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
subject: "[Continue the last session](../../subjects/cli/Continue%20the%20last%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
