---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: permissions/modes
  object:
    supported: partial
    modes:
      - name: allow-all-tools
        intent: full-auto
        argv:
          - --allow-all-tools
        notes: blanket tool permissions without a model safety review or approval prompts; deny rules still apply; env COPILOT_ALLOW_ALL
      - name: allow-all
        intent: bypass
        argv:
          - --allow-all
        notes: equivalent to --allow-all-tools --allow-all-paths --allow-all-urls; --yolo is the same
    note: --mode chooses interactive, plan or autopilot; the command reference does not say whether plan is read-only
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 GitHub Copilot CLI Allow all tools option docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Allow%20all%20tools%20option%20docs.md)"
      - "[2026-11-09 GitHub Copilot CLI Allow all option docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Allow%20all%20option%20docs.md)"
      - "[2026-11-09 GitHub Copilot CLI Yolo option docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Yolo%20option%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: command reference.
  - hasEvidenceItems:
      - "[2026-11-09 GitHub Copilot CLI Mode option docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-09%20GitHub%20Copilot%20CLI%20Mode%20option%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: command reference on --mode.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Permission modes](../../subjects/permissions/Permission%20modes.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Whether --mode plan is read-only, and how it maps to a generic intent, is not stated in the docs.
---
