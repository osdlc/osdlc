---
type: backlog
schema_version: '3'
id: B-0003
tags:
  - pr-update
  - attempts
  - mirror
last_reviewed: '2026-11-22'
---
# Require `git-ref` attempts for mirror targets

A repository updated from the managed clone has no checkout to hold
`<projectRoot>/.pr-update/attempts`.
[D-0005](../decisions/D-0005-managed-bare-mirror-checkout.md) puts a file
store in the mirror directory, one per cache, with each record keyed by its
repository. The alternative is to require `attempts.store: git-ref` for mirror
targets.

What it adds:

- No second file store, and no records left behind when `mirror_dir` moves or
  the cache is deleted.
- Records follow the repository to any machine, since they are refs on the
  remote (`src/update/ref-attempts.ts`).

What it costs:

- A file-store user must switch before using the cache. The run refuses a
  mirror target under `file`, and the message names the key to set.
- `git-ref` also turns on the per-branch update lease, and needs a remote that
  accepts refs outside `refs/heads` and `refs/tags` (`src/config.ts`).
- It breaks D-0005's criterion that existing file-store users see no change.

Owner (2026-11-22): the file store in the mirror directory for now. Take this
up if `git-ref` becomes the default store, or if the second store causes
trouble.
