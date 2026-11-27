---
"@osdlc/host-cleaner": minor
---

Add the `docker` plugin, which has Docker remove volumes no container uses (held, as lost data), dangling images no container uses, and its reclaimable build cache.

A candidate may set `capped: true`: the re-check drops it as `changed` when its `bytes` are more than the plan showed.
