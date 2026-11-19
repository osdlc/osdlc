---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: cli/current-env
  object:
    supported: true
    vars:
      - name: CODEX_THREAD_ID
        value: any
        meaning: the thread id; injected into the environment of commands Codex runs
      - name: CODEX_SANDBOX
        value: seatbelt
        meaning: the command runs under the macOS seatbelt sandbox
      - name: CODEX_SANDBOX_NETWORK_DISABLED
        value: "1"
        meaning: network access is off for the tool call
    note: The source says the CODEX_SANDBOX value may change to cover other sandboxes.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Running-inside variables source](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Running-inside%20variables%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Running-inside variables sandbox](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Running-inside%20variables%20sandbox.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Running-inside variables network meaning](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Running-inside%20variables%20network%20meaning.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Running-inside variables network](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Running-inside%20variables%20network.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Running-inside variables](../../subjects/cli/Running-inside%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
