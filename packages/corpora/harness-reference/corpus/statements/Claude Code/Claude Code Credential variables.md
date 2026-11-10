---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: config/credentials-env
  object:
    supported: true
    vars:
      - name: ANTHROPIC_API_KEY
        note: API key sent as X-Api-Key; used instead of a logged-in subscription
      - name: CLAUDE_CODE_OAUTH_TOKEN
        note: OAuth access token; alternative to /login for SDK and automated environments
      - name: ANTHROPIC_AUTH_TOKEN
        note: sent as a Bearer Authorization header
    login_command: claude auth login
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 docs env API_KEY](../../study-results/Claude%20Code/2026-11-09%20docs%20env%20API_KEY.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: ANTHROPIC_API_KEY is sent as X-Api-Key and overrides a subscription.
  - hasEvidenceItems:
      - "[2026-11-09 docs env OAUTH_TOKEN](../../study-results/Claude%20Code/2026-11-09%20docs%20env%20OAUTH_TOKEN.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: CLAUDE_CODE_OAUTH_TOKEN is the SDK and automation alternative to /login.
  - hasEvidenceItems:
      - "[2026-11-09 docs env AUTH_TOKEN](../../study-results/Claude%20Code/2026-11-09%20docs%20env%20AUTH_TOKEN.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: ANTHROPIC_AUTH_TOKEN sets the Authorization header.
  - hasEvidenceItems:
      - "[2026-11-09 help auth login](../../study-results/Claude%20Code/2026-11-09%20help%20auth%20login.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`claude auth login` signs in."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does CLAUDE_CODE_OAUTH_TOKEN take precedence over keychain credentials, and do Bedrock, Vertex and Foundry use their own provider credentials? Neither is in a quoted excerpt.
---
