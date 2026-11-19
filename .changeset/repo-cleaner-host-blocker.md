---
"@osdlc/repo-cleaner": minor
---

`Blocker` accepts a host-named blocker, `host:<name>` (the new `HostBlocker` type). A host's `annotate` can set a worktree row's verdict to `blocked` with such a blocker, as `host:orca-unreachable`; the sweep then clears the row's action and commands as for any blocked row.
