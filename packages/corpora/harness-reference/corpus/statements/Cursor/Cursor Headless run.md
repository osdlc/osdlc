---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/headless
  object:
    command: agent -p "<prompt>"
    flag: -p/--print
    note: --help says print has write and shell access; the headless docs say add --force to apply changes
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help print](../../study-results/Cursor/2026-11-09%20Cursor%20help%20print.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "Installed --help: -p/--print runs non-interactively."
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs headless force](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20headless%20force.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: --force is needed to apply file changes in print mode.
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
subject: "[Headless run](../../subjects/cli/Headless%20run.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The docs disagree with themselves about writes without --force: --help says print has write and shell access, the headless page says changes are only proposed.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
