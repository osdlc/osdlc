---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: permissions/modes
  object:
    supported: true
    modes:
      - name: plan
        intent: read-only
        argv:
          - --approval-mode
          - plan
      - name: auto-edit
        intent: edits
        argv:
          - --approval-mode
          - auto-edit
      - name: auto
        intent: full-auto
        argv:
          - --approval-mode
          - auto
        notes: an LLM classifier approves safe actions and blocks risky ones
      - name: yolo
        intent: bypass
        argv:
          - --approval-mode
          - yolo
    note: default requires approval for file edits or shell commands
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code Approval mode option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Approval%20mode%20option%20source.md)"
      - "[2026-11-09 Qwen Code Approval mode auto source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Approval%20mode%20auto%20source.md)"
      - "[2026-11-09 Qwen Code Approval mode plan source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Approval%20mode%20plan%20source.md)"
      - "[2026-11-09 Qwen Code Approval mode auto-edit source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Approval%20mode%20auto-edit%20source.md)"
      - "[2026-11-09 Qwen Code Approval mode yolo source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Approval%20mode%20yolo%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: approval mode option and descriptions in the source at v0.27.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Permission modes](../../subjects/permissions/Permission%20modes.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
