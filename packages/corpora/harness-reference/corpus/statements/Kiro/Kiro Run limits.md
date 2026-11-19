---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/limits
  object:
    supported: partial
    timeout:
      env: KIRO_HEADLESS_WORKFLOW_TIMEOUT_SECS
      default: 21600 seconds (six hours)
    on_limit: the run reports `workflow run incomplete` with a recovery hint
    note: "The only documented limit: how long a non-interactive V3 run waits for in-flight workflows after the turn ends. It is an environment variable, not a flag, and it does not cap the turn itself."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless workflow wait](../../study-results/Kiro/2026-11-14%20kiro%20headless%20workflow%20wait.md)"
      - "[2026-11-14 kiro headless workflow timeout variable](../../study-results/Kiro/2026-11-14%20kiro%20headless%20workflow%20timeout%20variable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the workflow wait and its variable."
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless workflow timeout result](../../study-results/Kiro/2026-11-14%20kiro%20headless%20workflow%20timeout%20result.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: what happens at the timeout."
reportedIn:
  - "[Kiro docs Headless mode](../../documents/kiro.dev/Kiro%20docs%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Run limits](../../subjects/cli/Run%20limits.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
