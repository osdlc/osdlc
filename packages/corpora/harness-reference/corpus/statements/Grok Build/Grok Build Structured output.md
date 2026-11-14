---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/structured-output
  object:
    output: --output-format json|streaming-json|streaming-messages-json
    partial: --include-partial-messages (streaming-messages-json only)
    schema: --json-schema <SCHEMA> (implies --output-format json)
    input: --prompt-json <JSON> (content blocks)
    rpc: grok agent (ACP) for tool approvals and other two-way flows; the streams are read only
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli output-format flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20output-format%20flag.md)"
      - "[2026-11-14 grok output format enum](../../study-results/Grok%20Build/2026-11-14%20grok%20output%20format%20enum.md)"
      - "[2026-11-14 grok cli json-schema flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20json-schema%20flag.md)"
      - "[2026-11-14 grok cli json-schema flag 2](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20json-schema%20flag%202.md)"
      - "[2026-11-14 grok cli include-partial-messages flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20include-partial-messages%20flag.md)"
      - "[2026-11-14 grok cli prompt-json flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20prompt-json%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The argument definitions and the format enum.
  - hasEvidenceItems:
      - "[2026-11-14 grok output formats](../../study-results/Grok%20Build/2026-11-14%20grok%20output%20formats.md)"
      - "[2026-11-14 grok include partial messages row](../../study-results/Grok%20Build/2026-11-14%20grok%20include%20partial%20messages%20row.md)"
      - "[2026-11-14 grok streams read only](../../study-results/Grok%20Build/2026-11-14%20grok%20streams%20read%20only.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless guide.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[xai-org grok-build headless cli.rs](../../documents/github.com/xai-org%20grok-build%20headless%20cli.rs.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Structured output](../../subjects/cli/Structured%20output.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
