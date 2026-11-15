---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: config/config-dir-env
  object:
    supported: true
    var: GROK_HOME
    replaces: ~/.grok
    sets:
      - config.toml
      - auth.json
      - sessions
      - rules
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok GROK_HOME row](../../study-results/Grok%20Build/2026-11-14%20grok%20GROK_HOME%20row.md)"
      - "[2026-11-14 grok GROK_HOME file locations](../../study-results/Grok%20Build/2026-11-14%20grok%20GROK_HOME%20file%20locations.md)"
      - "[2026-11-14 grok file locations rows](../../study-results/Grok%20Build/2026-11-14%20grok%20file%20locations%20rows.md)"
      - "[2026-11-14 grok sessions dir row](../../study-results/Grok%20Build/2026-11-14%20grok%20sessions%20dir%20row.md)"
      - "[2026-11-14 grok home rules row](../../study-results/Grok%20Build/2026-11-14%20grok%20home%20rules%20row.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless, sessions and project rules guides.
reportedIn:
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
  - "[Grok Build user guide Project rules](../../documents/github.com/Grok%20Build%20user%20guide%20Project%20rules.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Config directory variable](../../subjects/config/Config%20directory%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
