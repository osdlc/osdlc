---
"@osdlc/ref-lease": minor
---

New helpers `claim`, `updateWithRetry` and `release`, the guide's recipes as tested functions. `claim` creates a lease, or takes over one that is not live (or is the caller's own); `updateWithRetry` does a read-modify-write that re-reads after a lost swap, up to a bound, and can create or delete; `release` deletes only if the ref still holds the caller's sha and reports whether it did. Also `refKey(prefix, key)`, a safe readable ref name for any string key, and `refStore`, a keyed JSON store with one ref per key (`load`, `get`, `entries`, `update`, `prune`). Every payload rule is a callback, so the payload stays the caller's.
