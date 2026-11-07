---
'@osdlc/file-lock': minor
---

First release. Cross-process exclusive file locks for Node.js, in two shapes on one mechanism:

- A held lock: `claimLock(path, content, { isStale })` writes the content and a random token to a temp file and hard-links it into place, so the lock never exists empty. A lock the rule judges stale is taken over through a marker named from a hash of its content, so one reaper wins and a fresh lock is never deleted. `touchLock`, `updateLock` and `releaseLock` act only while the lock still holds the claim's token.
- Ready-made rules: `holderGone(pids)`, stale once no recorded pid is alive (`pidAlive`), and `untouchedFor(ms)`.
- A short critical section: `withLock(path, fn, { staleMs, timeoutMs, retryMs })` runs a synchronous `fn` holding the lock and throws `LockTimeoutError` when it stays held.
