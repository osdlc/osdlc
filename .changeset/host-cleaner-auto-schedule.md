---
"@osdlc/host-cleaner": minor
---

`host-cleaner clean --auto` cleans the unattended subset (candidates their owner marked `unattended: true` that nothing refuses or protests) with no `--allow`, under a lock, and writes a report and a receipt to the state directory. `host-cleaner schedule install|uninstall|status` manages a launchd user agent that runs it. The `git` plugin marks only a clean worktree unattended.
