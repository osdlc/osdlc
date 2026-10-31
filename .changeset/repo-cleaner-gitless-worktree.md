---
'@osdlc/repo-cleaner': patch
---

A registered worktree whose directory still exists but whose `.git` is gone (git lists it as prunable) no longer makes the whole repository unreadable with `git status: This is not a git repository`. It is a `safe-to-delete` row whose command is `git worktree prune`, which drops the registration and leaves the directory; `facts.directory_left` is true.
