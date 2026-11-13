---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: config/credentials-env
  object:
    supported: true
    vars:
      - name: AMP_API_KEY
        kind: other
        provider: ampcode.com
    note: An access token from Settings that starts with sgamp_. The short-lived session token that amp login stores is rejected.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 execute mode api key](../../study-results/Amp/2026-11-09%20execute%20mode%20api%20key.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 execute mode token prefix](../../study-results/Amp/2026-11-09%20execute%20mode%20token%20prefix.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
reportedIn:
  - "[Amp docs Execute Mode](../../documents/ampcode.com/Amp%20docs%20Execute%20Mode.md)"
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
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---


