---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/structured-output
  object:
    output: --output-format json (one JSON object with messages and metadata) or stream-json (one JSON event per line)
    partial: "stream-json events carry a type: message, notification, error or complete"
    argv:
      - run
      - --output-format
      - json
      - --text
      - "{prompt}"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli output-format flag](../../study-results/goose/2026-11-14%20goose%20cli%20output-format%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The clap definition of --output-format.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli json output struct](../../study-results/goose/2026-11-14%20goose%20cli%20json%20output%20struct.md)"
      - "[2026-11-14 goose cli stream event enum](../../study-results/goose/2026-11-14%20goose%20cli%20stream%20event%20enum.md)"
      - "[2026-11-14 goose cli stream event line](../../study-results/goose/2026-11-14%20goose%20cli%20stream%20event%20line.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The json output struct, the stream event enum and the function that prints one event per line.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs output formats](../../study-results/goose/2026-11-14%20goose%20docs%20output%20formats.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The running-tasks guide describes both formats.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose cli session mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli%20session%20mod.rs%20at%202365bc5.md)"
  - "[aaif-goose goose running-tasks.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20running-tasks.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Structured output](../../subjects/cli/Structured%20output.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`goose run --output-format json` prints one JSON object when the run ends; `stream-json` prints one JSON event per line as the run goes.
