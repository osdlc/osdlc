---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/output-format
  object:
    supported: true
    formats:
      - name: text
        argv: []
      - name: json
        argv:
          - --output-format
          - json
      - name: stream-json
        argv:
          - --output-format
          - stream-json
    note: goose run only. -q, --quiet prints only the model response.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli output-format flag](../../study-results/goose/2026-11-14%20goose%20cli%20output-format%20flag.md)"
      - "[2026-11-14 goose cli quiet flag](../../study-results/goose/2026-11-14%20goose%20cli%20quiet%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The clap definition of --output-format, its three values and its default, and of --quiet.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs output formats](../../study-results/goose/2026-11-14%20goose%20docs%20output%20formats.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The running-tasks guide describes json and stream-json.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose running-tasks.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20running-tasks.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Output format flag](../../subjects/cli/Output%20format%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`goose run --output-format` takes `text` (the default), `json` or `stream-json`.
