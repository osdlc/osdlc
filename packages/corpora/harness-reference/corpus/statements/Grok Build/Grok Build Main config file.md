---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: config/main-file
  object:
    file: ~/.grok/config.toml (user); .grok/config.toml (project, only [mcp_servers], [plugins] and [permission])
    format: TOML
    scope: user, with a project overlay for a few sections
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 grok config location](../../study-results/Grok%20Build/2026-11-09%20grok%20config%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 grok project config](../../study-results/Grok%20Build/2026-11-09%20grok%20project%20config.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
reportedIn:
  - "[Grok Build user guide Configuration](../../documents/github.com/Grok%20Build%20user%20guide%20Configuration.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-08-08T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Main config file](../../subjects/config/Main%20config%20file.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:config/main-file@grok-build#scope-[null,null,null]
---

Imported from `facts/grok-build/config/main-file.md`.
