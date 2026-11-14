---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/limits
  object:
    supported: partial
    max_turns:
      argv:
        - --max-turns
        - "{n}"
      config_key: GOOSE_MAX_TURNS
    note: Turns only (default 1000). --max-tool-repetitions <NUMBER> caps consecutive identical tool calls, not the total. goose run has no budget or time flag.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli max-turns flag](../../study-results/goose/2026-11-14%20goose%20cli%20max-turns%20flag.md)"
      - "[2026-11-14 goose cli max-tool-repetitions flag](../../study-results/goose/2026-11-14%20goose%20cli%20max-tool-repetitions%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The clap definitions of --max-turns and --max-tool-repetitions.
  - hasEvidenceItems:
      - "[2026-11-14 goose config GOOSE_MAX_TURNS](../../study-results/goose/2026-11-14%20goose%20config%20GOOSE_MAX_TURNS.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The config reads GOOSE_MAX_TURNS, with a default of 1000.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli run option groups](../../study-results/goose/2026-11-14%20goose%20cli%20run%20option%20groups.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The option groups of goose run hold no budget or timeout flag.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose config base.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20config%20base.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Run limits](../../subjects/cli/Run%20limits.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - "What does a run do when it reaches --max-turns in headless mode: exit code and output?"
---

A run can be capped in turns with `--max-turns` or `GOOSE_MAX_TURNS`. The CLI definition has no budget or wall-time limit.
