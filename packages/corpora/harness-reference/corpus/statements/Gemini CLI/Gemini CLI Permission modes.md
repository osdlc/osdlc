---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: permissions/modes
  object:
    supported: true
    modes:
      - name: plan
        intent: read-only
        argv:
          - --approval-mode
          - plan
      - name: auto_edit
        intent: edits
        argv:
          - --approval-mode
          - auto_edit
      - name: yolo
        intent: bypass
        argv:
          - --approval-mode
          - yolo
    note: default prompts for approval (--approval-mode default)
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Approval mode help](../../study-results/Gemini%20CLI/2026-11-09%20Approval%20mode%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text for 0.65.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Permission modes](../../subjects/permissions/Permission%20modes.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
