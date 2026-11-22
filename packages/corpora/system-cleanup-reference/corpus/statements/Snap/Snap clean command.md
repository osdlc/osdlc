---
proposition:
  subject: '[Snap](../../stores/Snap.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: sudo snap set system refresh.retain=2
      removes: older revisions beyond 2 after the next refresh
    - command: sudo snap remove <snap> --revision=<rev>
      removes: one specific (disabled) revision of a snap
    - command: sudo snap forget <set-id>
      removes: a saved snapshot, including automatic ones
    - command: sudo snap remove <snap> --purge
      removes: a snap without keeping an automatic snapshot
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Snap clean command 1](../../study-results/Snap/2026-11-21%20Snap%20clean%20command%201.md)'
  - '[2026-11-21 Snap clean command 2](../../study-results/Snap/2026-11-21%20Snap%20clean%20command%202.md)'
  - '[2026-11-21 Snap clean command 3](../../study-results/Snap/2026-11-21%20Snap%20clean%20command%203.md)'
  - '[2026-11-21 Snap clean command 4](../../study-results/Snap/2026-11-21%20Snap%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: snap has no single prune command; revisions are trimmed by refresh.retain or per revision
    with snap remove --revision, and snapshots with snap forget.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Snap](../../stores/Snap.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

snap has no single prune command; revisions are trimmed by refresh.retain or per revision with snap remove --revision, and snapshots with snap forget.
