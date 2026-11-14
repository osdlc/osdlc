---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: true
    replace_argv:
      - --system-prompt-override
      - "{text}"
    append_argv:
      - --rules
      - "{text}"
    note: --system-prompt is an alias of --system-prompt-override, and --append-system-prompt of --rules. The argument definitions hold no file form.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli rules flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20rules%20flag.md)"
      - "[2026-11-14 grok cli system-prompt-override flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20system-prompt-override%20flag.md)"
      - "[2026-11-14 grok cli argument list](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20argument%20list.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The argument definitions of --rules and --system-prompt-override.
  - hasEvidenceItems:
      - "[2026-11-14 grok rules row](../../study-results/Grok%20Build/2026-11-14%20grok%20rules%20row.md)"
      - "[2026-11-14 grok system prompt override row](../../study-results/Grok%20Build/2026-11-14%20grok%20system%20prompt%20override%20row.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless guide.
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
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

No source says whether the override drops the harness defaults, so `replace_drops_defaults` is left out.
