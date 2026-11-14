---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/model-selection
  object:
    model: --model <MODEL>
    provider: --provider <PROVIDER>
    effort: no flag; GOOSE_THINKING_EFFORT=<level>
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli provider flag](../../study-results/goose/2026-11-14%20goose%20cli%20provider%20flag.md)"
      - "[2026-11-14 goose cli model flag](../../study-results/goose/2026-11-14%20goose%20cli%20model%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: goose run and goose session define --provider and --model.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli model options struct](../../study-results/goose/2026-11-14%20goose%20cli%20model%20options%20struct.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The model options hold nothing else, so effort has no flag.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs GOOSE_THINKING_EFFORT](../../study-results/goose/2026-11-14%20goose%20docs%20GOOSE_THINKING_EFFORT.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The provider docs name the effort variable.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose providers.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20providers.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Model and effort flags](../../subjects/cli/Model%20and%20effort%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`--provider` and `--model` override the configured provider and model for one run. Effort has no flag.
