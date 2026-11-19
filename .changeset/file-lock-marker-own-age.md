---
"@osdlc/file-lock": minor
---

A takeover marker's age is its own mtime, so a reaper that dies mid-takeover is cleared on every OS (a change to the on-disk protocol; upgrade `osdlc-file-lock` with it, since both must judge a marker the same way).

- The marker is an empty file created exclusively, no longer a hard link of the lock. Its mtime is when its reaper began, where the old marker's mtime and ctime came from the lock it linked. A marker older than `MARKER_STALE_MS` (10 s) is a dead reaper's and the next claimant removes it.
- It no longer reads the inode's ctime, so the takeover is the same on Windows, where a hard link shares the lock's times.
