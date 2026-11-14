---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: script
        platforms:
          - macos
          - linux
        argv:
          - sh
          - -c
          - curl -fsSL https://x.ai/cli/install.sh | bash
        note: also Windows through Git Bash
      - kind: script
        platforms:
          - windows
        note: irm https://x.ai/cli/install.ps1 | iex
      - kind: other
        platforms:
          - windows
        package: xAI.GrokBuild
        note: WinGet; the guide gives only the upgrade command
    update: grok update; a WinGet install updates with winget upgrade --id xAI.GrokBuild -e
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok install script](../../study-results/Grok%20Build/2026-11-14%20grok%20install%20script.md)"
      - "[2026-11-14 grok install powershell](../../study-results/Grok%20Build/2026-11-14%20grok%20install%20powershell.md)"
      - "[2026-11-14 grok update command](../../study-results/Grok%20Build/2026-11-14%20grok%20update%20command.md)"
      - "[2026-11-14 grok winget update](../../study-results/Grok%20Build/2026-11-14%20grok%20winget%20update.md)"
      - "[2026-11-14 grok winget upgrade command](../../study-results/Grok%20Build/2026-11-14%20grok%20winget%20upgrade%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The getting started guide.
reportedIn:
  - "[Grok Build user guide Getting started](../../documents/github.com/Grok%20Build%20user%20guide%20Getting%20started.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The guide does not say how to remove the harness, so `uninstall` is left out.
