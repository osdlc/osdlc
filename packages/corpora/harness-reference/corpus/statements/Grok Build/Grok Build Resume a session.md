---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/resume
  object:
    supported: true
    flags: -r/--resume <id-or-title>
    by: session id, or session title for the current directory with letter case ignored
    latest: --resume with no value, or -c/--continue
    picker: /resume in the TUI
    argv:
      - -p
      - "{prompt}"
      - --resume
      - "{id}"
    refused_when: the session does not exist
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli resume flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20resume%20flag.md)"
      - "[2026-11-14 grok cli resume flag 2](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20resume%20flag%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The argument definition of -r/--resume.
  - hasEvidenceItems:
      - "[2026-11-14 grok resume flag doc](../../study-results/Grok%20Build/2026-11-14%20grok%20resume%20flag%20doc.md)"
      - "[2026-11-14 grok resume errors](../../study-results/Grok%20Build/2026-11-14%20grok%20resume%20errors.md)"
      - "[2026-11-14 grok resume most recent](../../study-results/Grok%20Build/2026-11-14%20grok%20resume%20most%20recent.md)"
      - "[2026-11-14 grok resume picker](../../study-results/Grok%20Build/2026-11-14%20grok%20resume%20picker.md)"
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
subject: "[Resume a session](../../subjects/cli/Resume%20a%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
