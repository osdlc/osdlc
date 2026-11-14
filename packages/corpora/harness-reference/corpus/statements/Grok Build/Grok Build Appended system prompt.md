---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/append-system-prompt
  object:
    supported: true
    flag: --rules
    note: --append-system-prompt is accepted as an alias
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli rules flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20rules%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The argument definition: --rules appends rules to the system prompt, alias append-system-prompt."
  - hasEvidenceItems:
      - "[2026-11-14 grok rules row](../../study-results/Grok%20Build/2026-11-14%20grok%20rules%20row.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless guide lists --rules.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Appended system prompt](../../subjects/cli/Appended%20system%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The flag exists and the source says its text is appended to the system prompt. No run was made, so whether the model sees the text and whether a leading slash command still parses are not recorded.
