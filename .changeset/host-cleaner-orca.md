---
"@osdlc/host-cleaner": minor
---

New `orca` plugin. When the Orca app is running, it notes each worktree Orca manages, refuses one with an agent at work, protests (`close-terminals`) one with open terminals and closes them before the `git` plugin removes it, then asks Orca to forget the record. A record whose directory is gone is its own `orca-record` candidate, and `plugins.orca.repos` (default true) sweeps the repositories `orca repo list` names. With `orca` missing or not running the plugin stays out of the run.
