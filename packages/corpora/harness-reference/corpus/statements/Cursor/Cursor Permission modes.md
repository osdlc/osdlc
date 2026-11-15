---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: permissions/modes
  object:
    supported: true
    modes:
      - name: ask
        intent: read-only
        argv:
          - --mode
          - ask
        notes: Q&A, read-only per --help
      - name: plan
        intent: read-only
        argv:
          - --mode
          - plan
        notes: read-only planning, no edits per --help
      - name: auto-review
        intent: full-auto
        argv:
          - --auto-review
        notes: a server classifier auto-runs safe tool calls and prompts for the rest
      - name: force
        intent: bypass
        argv:
          - --force
        notes: allows commands unless explicitly denied; --yolo is an alias
    note: --sandbox enabled|disabled is a separate switch that restricts or unrestricts command execution; it is not mapped to an intent
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help mode](../../study-results/Cursor/2026-11-09%20Cursor%20help%20mode.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --mode plan and ask are read-only.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help force sandbox](../../study-results/Cursor/2026-11-09%20Cursor%20help%20force%20sandbox.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --force, --auto-review and --sandbox flags.
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
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Permission modes](../../subjects/permissions/Permission%20modes.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Intents are the closest generic match, not the vendor’s words.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited. Every key rests on the help-text lines; the earlier sandbox-as-full-auto mapping and the docs-only approvalMode and default keys were removed.
