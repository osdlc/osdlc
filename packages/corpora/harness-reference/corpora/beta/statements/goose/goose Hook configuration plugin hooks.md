---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: hooks/config
  object:
    documented: true
    supported: true
    kind: shell command hooks inside plugins
    location: hooks/hooks.json in a plugin under ~/.agents/plugins/<name>/ or <project>/.agents/plugins/<name>/
    shell_hooks: true
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 hooks plugin hooks.json](../../study-results/goose/2026-11-09%20hooks%20plugin%20hooks.json.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 goose hooks locations](../../study-results/goose/2026-11-09%20goose%20hooks%20locations.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 hooks open plugins spec](../../study-results/goose/2026-11-09%20hooks%20open%20plugins%20spec.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 hooks run as shell commands](../../study-results/goose/2026-11-09%20hooks%20run%20as%20shell%20commands.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
reportedIn:
  - "[aaif-goose goose hooks.md at 0edf2bd](../../documents/github.com/aaif-goose%20goose%20hooks.md%20at%200edf2bd.md)"
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
subject: "[Hook configuration](../../subjects/hooks/Hook%20configuration.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[goose Hook configuration](goose%20Hook%20configuration.md)"
---

The earlier statement found no hook support; the hooks guide now documents plugin hooks that follow the Open Plugins hooks specification.
