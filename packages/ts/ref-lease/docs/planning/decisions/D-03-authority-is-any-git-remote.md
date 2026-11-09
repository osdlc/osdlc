---
id: D-03
type: decision
state: accepted
created: 2026-05-31
---

# D-03: The authority is any git remote

## Decision

The authority is a git remote name or URL. Its refs are the truth. The library treats every kind
the same; what differs is who can see the leases.

| Authority | Coordinates |
|---|---|
| A hosted or shared remote (HTTPS, SSH) | Every worker with access to it. |
| A bare repository on one machine (a path or `file://`) | The clones on that machine configured to use it, or machines that mount it from a filesystem with correct locking. |
| The worker's own repository | Nothing: it is not shared. |

## Why

The data model is the same in every case, so a project can start with a local bare repository and
move to a hosted remote without a change to the leases. The caller should show which authority it
uses, so an operator can tell local coordination from shared.
