---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: config/credentials-env
  object:
    supported: true
    vars:
      - name: XAI_API_KEY
        kind: api-key
        provider: xAI
        precedence: a stored session token takes precedence; the key is the fallback when no session token is active
      - name: GROK_CODE_XAI_API_KEY
        kind: api-key
        provider: xAI
        precedence: accepted for backward compatibility
    login_command: grok login
    note: grok login --device-auth signs in with no browser on the machine.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok XAI_API_KEY row](../../study-results/Grok%20Build/2026-11-14%20grok%20XAI_API_KEY%20row.md)"
      - "[2026-11-14 grok api key precedence](../../study-results/Grok%20Build/2026-11-14%20grok%20api%20key%20precedence.md)"
      - "[2026-11-14 grok legacy api key variable](../../study-results/Grok%20Build/2026-11-14%20grok%20legacy%20api%20key%20variable.md)"
      - "[2026-11-14 grok login headless](../../study-results/Grok%20Build/2026-11-14%20grok%20login%20headless.md)"
      - "[2026-11-14 grok device auth](../../study-results/Grok%20Build/2026-11-14%20grok%20device%20auth.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless, authentication and custom models guides.
reportedIn:
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
  - "[Grok Build user guide Authentication](../../documents/github.com/Grok%20Build%20user%20guide%20Authentication.md)"
  - "[Grok Build user guide Custom models](../../documents/github.com/Grok%20Build%20user%20guide%20Custom%20models.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
