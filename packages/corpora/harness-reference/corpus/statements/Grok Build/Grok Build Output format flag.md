---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/output-format
  object:
    supported: true
    formats:
      - name: plain
        argv: []
      - name: json
        argv:
          - --output-format
          - json
      - name: streaming-json
        argv:
          - --output-format
          - streaming-json
      - name: streaming-messages-json
        argv:
          - --output-format
          - streaming-messages-json
    note: plain is the default. --json-schema implies json. --include-partial-messages only affects streaming-messages-json.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli output-format flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20output-format%20flag.md)"
      - "[2026-11-14 grok output format enum](../../study-results/Grok%20Build/2026-11-14%20grok%20output%20format%20enum.md)"
      - "[2026-11-14 grok cli json-schema flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20json-schema%20flag.md)"
      - "[2026-11-14 grok cli json-schema flag 2](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20json-schema%20flag%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The flag definition and the format enum.
  - hasEvidenceItems:
      - "[2026-11-14 grok output formats](../../study-results/Grok%20Build/2026-11-14%20grok%20output%20formats.md)"
      - "[2026-11-14 grok output format row](../../study-results/Grok%20Build/2026-11-14%20grok%20output%20format%20row.md)"
      - "[2026-11-14 grok include partial messages row](../../study-results/Grok%20Build/2026-11-14%20grok%20include%20partial%20messages%20row.md)"
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
subject: "[Output format flag](../../subjects/cli/Output%20format%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
