---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: config/credentials-env
  object:
    supported: true
    vars:
      - name: GEMINI_API_KEY
        kind: api-key
        provider: Gemini API
      - name: GOOGLE_API_KEY
        kind: api-key
        provider: Google Cloud
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 API key docs](../../study-results/Gemini%20CLI/2026-11-09%20API%20key%20docs.md)"
      - "[2026-11-09 Google API key docs](../../study-results/Gemini%20CLI/2026-11-09%20Google%20API%20key%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: configuration reference.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
