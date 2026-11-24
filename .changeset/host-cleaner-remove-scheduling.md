---
"@osdlc/host-cleaner": minor
---

Remove `schedule` and `clean --auto` for the first version. The `schedule`
command (the launchd agent), `clean --auto` with its lock and reports, and the
`unattended` candidate mark are gone; plain `clean` and its receipts stay. A
candidate a plugin holds for review is now marked `held: true` (it was
`unattended: false`). The design is kept in
`docs/planning/backlog/B-0001-unattended-cleaning.md` so it can come back.
