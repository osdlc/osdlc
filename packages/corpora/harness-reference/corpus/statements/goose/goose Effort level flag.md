---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/effort
  object:
    supported: partial
    env:
      GOOSE_THINKING_EFFORT: <level>
    levels:
      - off
      - low
      - medium
      - high
      - max
    note: "No flag: goose run and goose session take only --provider and --model. The parser also accepts disabled and none (off), med (medium) and xhigh (max). For OpenAI Responses and xAI reasoning models, a -none, -low, -medium, -high or -xhigh suffix on the model name sets the effort."
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose docs GOOSE_THINKING_EFFORT](../../study-results/goose/2026-11-14%20goose%20docs%20GOOSE_THINKING_EFFORT.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The provider docs name the variable and its five levels.
  - hasEvidenceItems:
      - "[2026-11-14 goose thinking effort levels](../../study-results/goose/2026-11-14%20goose%20thinking%20effort%20levels.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The effort parser accepts these levels and their aliases.
  - hasEvidenceItems:
      - "[2026-11-14 goose model effort suffix](../../study-results/goose/2026-11-14%20goose%20model%20effort%20suffix.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: normalize_effort_suffix reads an effort suffix off the model name.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli model options struct](../../study-results/goose/2026-11-14%20goose%20cli%20model%20options%20struct.md)"
      - "[2026-11-14 goose cli run option groups](../../study-results/goose/2026-11-14%20goose%20cli%20run%20option%20groups.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The model options of the CLI hold only provider and model, so there is no effort flag.
reportedIn:
  - "[aaif-goose goose providers.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20providers.md%20at%202365bc5.md)"
  - "[aaif-goose goose thinking.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20thinking.rs%20at%202365bc5.md)"
  - "[aaif-goose goose provider-types model.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20provider-types%20model.rs%20at%202365bc5.md)"
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Effort level flag](../../subjects/cli/Effort%20level%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Which providers honour GOOSE_THINKING_EFFORT? The docs name the variable only in the Meta Muse Spark section.
---

goose has no effort flag. The effort is set with `GOOSE_THINKING_EFFORT`, or for some models by a suffix on the model name.
