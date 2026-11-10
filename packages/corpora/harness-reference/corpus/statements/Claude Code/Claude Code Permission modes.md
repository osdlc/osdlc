---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: permissions/modes
  object:
    supported: true
    default: auto in interactive terminal and VS Code sessions from 2.1.283
    modes:
      - name: plan
        intent: read-only
        argv:
          - --permission-mode
          - plan
        notes: Reads, plus classifier-approved commands when auto mode is available.
      - name: acceptEdits
        intent: edits
        argv:
          - --permission-mode
          - acceptEdits
        notes: Reads, file edits and common filesystem commands run without asking.
      - name: auto
        intent: full-auto
        argv:
          - --permission-mode
          - auto
        notes: Everything runs, with background safety checks.
      - name: bypassPermissions
        intent: bypass
        argv:
          - --dangerously-skip-permissions
        notes: --permission-mode bypassPermissions is equivalent.
      - name: default
        intent: read-only
        argv:
          - --permission-mode
          - manual
        notes: Reads only. Manual is accepted as an alias for default.
    note: 'dontAsk (--permission-mode dontAsk) has no generic intent here: file reads inside the working directories and pre-approved tools run, and anything that would prompt is denied, though an installed mod can still approve some of those calls.'
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 docs cli permission-mode](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20permission-mode.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference lists default, acceptEdits, plan, auto, dontAsk, bypassPermissions and the manual alias.
  - hasEvidenceItems:
      - "[2026-11-09 docs perm modes table](../../study-results/Claude%20Code/2026-11-09%20docs%20perm%20modes%20table.md)"
      - "[2026-11-09 docs perm modes plan](../../study-results/Claude%20Code/2026-11-09%20docs%20perm%20modes%20plan.md)"
      - "[2026-11-09 docs perm modes accept](../../study-results/Claude%20Code/2026-11-09%20docs%20perm%20modes%20accept.md)"
      - "[2026-11-09 docs perm modes auto](../../study-results/Claude%20Code/2026-11-09%20docs%20perm%20modes%20auto.md)"
      - "[2026-11-09 docs perm modes bypass](../../study-results/Claude%20Code/2026-11-09%20docs%20perm%20modes%20bypass.md)"
      - "[2026-11-09 docs perm modes dontask](../../study-results/Claude%20Code/2026-11-09%20docs%20perm%20modes%20dontask.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The permission modes page says what each mode runs without asking.
  - hasEvidenceItems:
      - "[2026-11-09 docs cli skip permissions](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20skip%20permissions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference says --dangerously-skip-permissions is equivalent to --permission-mode bypassPermissions.
  - hasEvidenceItems:
      - "[2026-11-09 docs perm modes auto start](../../study-results/Claude%20Code/2026-11-09%20docs%20perm%20modes%20auto%20start.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Auto is the starting mode for interactive terminal sessions from 2.1.283.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Permission modes](../../subjects/permissions/Permission%20modes.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - The mode a `claude -p` run starts in is described on the permission modes page under "which mode a session starts in"; no excerpt here quotes it.
  - The subject shape has no place for a mode that has no argv-only selector or for the default per surface.
---
