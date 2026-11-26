---
"@osdlc/file-lock": minor
---

New `readHeldLock(path)`: the lock as a claim reads a held one, read without
claiming it or changing anything. It is the `HeldLock` a claim would hand
`isStale`, from one open of the file, with the content parsed by the same
rules: null when the file is not a JSON object, or its `token` is not a
string. Pass it to your staleness rule to learn what a claim would decide, for
a report or a dry run, without keeping a second parser that can drift from the
claim's. It throws `NotALockError` for anything but a regular file, and the
open error otherwise (`ENOENT` when there is no lock).
