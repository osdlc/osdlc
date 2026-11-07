---
id: D-06
type: decision
state: accepted
created: 2026-06-01
---

# D-06: The namespace guard

## Decision

`checkNamespaceConflict(authority, namespaceRef)` asks the authority (`git ls-remote`) whether a
literal ref sits at the namespace path itself, such as `refs/locks`, and throws
`NamespaceConflict` if so. Refs under the namespace pass. A caller runs it before the first write.

The namespace is a required argument. Each call asks the authority again; the library keeps no
cache.

## Why

git cannot store a ref at a path `P` and refs under `P/` at once, so a literal `refs/locks` makes
every create under `refs/locks/...` fail with a git plumbing error that does not say why. The
conflict is scoped to the namespace path: a branch named `refs/heads/locks` does not share its
prefix and is fine. git refuses to push a ref with one segment after `refs/`, so such a ref is
usually made on the authority by another tool or an administrator.

A process-wide cache in a library is shared state its callers cannot see or scope. The right key
for it (authority, namespace, working directory) is the caller's to choose, so a caller that checks
before every write keeps its own record.
