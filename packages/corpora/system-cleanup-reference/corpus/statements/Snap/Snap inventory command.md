---
proposition:
  subject: '[Snap](../../stores/Snap.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: snap list --all
      shows: every installed revision, with older ones marked disabled
    - command: snap saved
      shows: snapshots with their age and size, auto ones marked
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Snap inventory command 1](../../study-results/Snap/2026-11-21%20Snap%20inventory%20command%201.md)'
  - '[2026-11-21 Snap inventory command 2](../../study-results/Snap/2026-11-21%20Snap%20inventory%20command%202.md)'
  - '[2026-11-21 Snap inventory command 3](../../study-results/Snap/2026-11-21%20Snap%20inventory%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: snap list --all appears in the manage-updates example and shows disabled revisions; snap
    saved lists snapshots with sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Snap](../../stores/Snap.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

snap list --all appears in the manage-updates example and shows disabled revisions; snap saved lists snapshots with sizes.
