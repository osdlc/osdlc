---
"@osdlc/host-cleaner": minor
---

`host-cleaner --auto` cleans the unattended subset with no `--allow`: build artifacts idle past their threshold with no build running, and worktrees judged `delete` with no risk. Rows are picked by id, so branches, review rows and sessions never run. A lock file in the state directory makes a second concurrent run exit without work, and each run writes a report (cleaned, left for review, bytes freed) beside its receipt. `host-cleaner schedule install [--every <hours>]`, `uninstall` and `status` manage a launchd user agent that runs `host-cleaner --auto` (macOS). `selectUnattended` is exported.
