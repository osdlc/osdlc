---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/context-dirs
  object:
    supported: false
    basis: omitted-from-help
    note: goose run and goose session define no flag that adds a directory; the option groups cover input, session, extensions, output and model only.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli run option groups](../../study-results/goose/2026-11-14%20goose%20cli%20run%20option%20groups.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The option groups of goose run hold no directory flag.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Extra context directories](../../subjects/cli/Extra%20context%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is there a config key or variable that widens file access beyond the working directory? None was found in the CLI definition; the config was not searched exhaustively.
---

The CLI definition of `goose run` has no flag that adds a directory beside the working directory.
