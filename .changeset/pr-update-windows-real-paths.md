---
"@osdlc/pr-update": patch
---

On Windows, pr-update compares and names checkouts, clones and worktrees by
their real path with any short name expanded (`C:\Users\RUNNER~1` becomes
`C:\Users\runneradmin`), as git reports them. A checkout reached by a short
name was named by that short name before, so it could differ from the path
git and the trust store gave for the same folder. On macOS the real path can
now also take the letter case the disk has, where before it kept the case it
was given. A kept worktree whose record an older run wrote under another
spelling of the same git directory is still read as this checkout's.
