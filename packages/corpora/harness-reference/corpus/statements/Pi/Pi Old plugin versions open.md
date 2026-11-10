---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: plugins/upgrade-retention
  object:
    open: &a1
      - After pi update, do older package versions or checkouts stay on disk? The docs say updates reconcile the checkout but do not move a configured ref.
direction: neutral
reportedIn:
  - "[Pi docs Pi Packages (main at d57c2d2)](../../documents/github.com/Pi%20docs%20Pi%20Packages%20%28main%20at%20d57c2d2%29.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: open
open: *a1
imported_from: fact:plugins/upgrade-retention@pi#open
---

Imported from `facts/pi/plugins/upgrade-retention.md`.

Open questions:
- After pi update, do older package versions or checkouts stay on disk? The docs say updates reconcile the checkout but do not move a configured ref.
