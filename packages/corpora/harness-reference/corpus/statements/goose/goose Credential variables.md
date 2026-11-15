---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: config/credentials-env
  object:
    supported: true
    vars:
      - name: OPENAI_API_KEY
        kind: api-key
        provider: openai
        precedence: takes precedence over stored secrets
    note: The provider's own environment variable; goose does not read provider API keys from config.yaml. OPENAI_API_KEY is the docs' example.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 config-files credentials env](../../study-results/goose/2026-11-09%20config-files%20credentials%20env.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 config-files no keys in yaml](../../study-results/goose/2026-11-09%20config-files%20no%20keys%20in%20yaml.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
reportedIn:
  - "[aaif-goose goose config-files.md at 0edf2bd](../../documents/github.com/aaif-goose%20goose%20config-files.md%20at%200edf2bd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---


