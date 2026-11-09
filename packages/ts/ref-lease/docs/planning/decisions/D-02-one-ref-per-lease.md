---
id: D-02
type: decision
state: accepted
created: 2026-05-31
---

# D-02: One ref per lease, outside `refs/heads/`

## Decision

Each lease is its own ref, under a namespace the caller picks outside `refs/heads/`, such as
`refs/locks/<name>`. The ref points at a commit whose tree holds the payload. Each write is a new
commit whose parent is the previous one, so `git log <ref>` is the lease's history.

## Why

- **Contention stays per lease.** One shared state branch holding every lease as a file is easier
  to browse, but every write contends on one tip, and two workers updating different leases still
  race and need rebase logic.
- **Hosts and CI ignore it.** Refs outside `refs/heads/` do not show as branches on a git host, and
  `on: push: branches:` workflows do not fire on them.
- **History for free.** A lease's earlier states are ordinary commits.

The cost is a larger ref namespace, and that branch protection rules, which apply only inside
`refs/heads/`, cannot restrict writes to leases.

## Alternatives considered

| Alternative | Why not |
|---|---|
| One state branch with a file per lease | Every write contends on one tip. |
| Refs under `refs/heads/` | Clutters branch lists; triggers branch CI. |
| A host's issues, labels or API | Tied to one host, rate limited, no compare-and-swap. |
| A local database | Not shared between machines. |
