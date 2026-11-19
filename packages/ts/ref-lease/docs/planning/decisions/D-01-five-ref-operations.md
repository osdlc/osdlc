---
id: D-01
type: decision
state: accepted
created: 2026-05-31
---

# D-01: Five ref operations over `--force-with-lease`

## Decision

Every write to the authority is one of three compare-and-swaps, and every read one of two fetches.

| Operation | git |
|---|---|
| `casCreate(ref, new)` | `git push --force-with-lease=<ref>: <authority> <new>:<ref>` |
| `casReplace(ref, expected, new)` | `git push --force-with-lease=<ref>:<expected> <authority> <new>:<ref>` |
| `casDelete(ref, expected)` | `git push --force-with-lease=<ref>:<expected> <authority> :<ref>` |
| `fetchRef(ref)` | `git fetch <authority> +<ref>:<ref>`, then read the payload blob |
| `fetchNamespace(prefix)` | `git fetch <authority> --prune +<prefix>/*:<prefix>/*` |

- The lease always names its expected value. The bare `--force-with-lease` compares against a
  remote-tracking ref, which may be stale, so the library never uses it.
- A create uses the empty expected value, `<ref>:`, meaning "must not exist". It is the only atomic
  way to claim a new ref.
- A create that git reports as `Everything up-to-date` found the ref already at the sha it wanted
  to write. The ref existed, so the create lost.
- `fetchNamespace` prunes, so local copies of refs the authority deleted go too. Use it to read many
  leases at once; use `fetchRef` for one.
- Each of the five operations is one attempt. A lost compare-and-swap is reported, not retried (the
  `claim`, `updateWithRetry` helpers layered on them do retry, bounded; see D-08): whether to retry
  depends on what the caller reads next. The one retry is local, for a fetch that collides with
  another process on a local ref lock, which clears in milliseconds.
- A successful write also moves the local copy of the ref (the mirror), guarded so it never
  rewinds a newer local value.

## Why

`--force-with-lease=<ref>:<sha>` is git's own compare-and-swap, checked by the receiving side, so
any git remote can be the authority and no other service is needed. Keeping retries out of the
operations keeps them deterministic and lets the caller's policy (fail fast for a heartbeat, a
longer budget for a claim) live with the caller.
