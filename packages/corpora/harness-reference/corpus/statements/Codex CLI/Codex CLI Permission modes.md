---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: permissions/modes
  object:
    supported: true
    modes:
      - name: read-only
        intent: read-only
        argv:
          - --sandbox
          - read-only
        config_key: sandbox_mode
      - name: workspace-write
        intent: edits
        argv:
          - --sandbox
          - workspace-write
        config_key: sandbox_mode
        notes: The intent is the closest of the four fixed values.
      - name: danger-full-access
        intent: bypass
        argv:
          - --sandbox
          - danger-full-access
        config_key: sandbox_mode
      - name: dangerously-bypass-approvals-and-sandbox
        intent: bypass
        argv:
          - --dangerously-bypass-approvals-and-sandbox
        notes: Skips approval prompts and the sandbox.
    note: "Approval prompts are a separate axis: approval_policy takes on-request, never or a granular table."
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Permission modes help](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Permission%20modes%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Permission modes bypass](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Permission%20modes%20bypass.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Permission modes sandbox mode](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Permission%20modes%20sandbox%20mode.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Permission modes approval policy](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Permission%20modes%20approval%20policy.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Permission modes](../../subjects/permissions/Permission%20modes.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
