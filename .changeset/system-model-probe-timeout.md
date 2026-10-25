---
'@osdlc/system-model': minor
---

A runner's probe timeout now bounds the whole probe, not only each subprocess. A runner still running at its timeout is stopped: the processes it started are killed with their trees, and it reports `status: 'error'` with the diagnostic `timed out after 10 s`. The other runners go on, and a timed-out runner is not stored in the cache. A runner whose subprocesses run one after another may now be cut off sooner than before; raise its limit with `CollectOptions.timeouts`.

New `CollectOptions.probeTimeoutMs` sets the probe timeout of every runner `timeouts` does not name. A runner's context `signal` is now its own: it aborts when the caller's does, or at the timeout.

New, experimental: `project.runners.collectAndStore(profile, dir)` returns `{ catalog, stored }` as soon as every runner has answered, then hashes the files and writes the store in the background. `stored` settles when the writes end; await it before the process exits. `collectAndCache` is `collectAndStore` with the writes awaited. Writes to one entry from two probes in a row land in order.
