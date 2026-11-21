---
proposition:
  subject: '[Cabal](../../stores/Cabal.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: cabal clean
      removes: the project's dist-newstyle folder
    - command: cabal clean --save-config
      removes: build artefacts in dist-newstyle, keeping configuration and caches
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cabal clean command 1](../../study-results/Cabal/2026-11-21%20Cabal%20clean%20command%201.md)'
  - '[2026-11-21 Cabal clean command 2](../../study-results/Cabal/2026-11-21%20Cabal%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The commands reference documents cabal clean; no command for pruning the store or package
    cache was found.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cabal](../../stores/Cabal.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No cabal command prunes the store; the docs only say the cache directory can be deleted by hand.
---

The commands reference documents cabal clean; no command for pruning the store or package cache was found.
