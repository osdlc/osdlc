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

Records for a target other than the project root have no home that belongs
to them: today they would land in whatever directory the run started from.
[D-0005](../decisions/D-0005-managed-bare-mirror-checkout.md) gives them a file
store in pr-update's state home, one file per repo, head and base. The
alternative is to require `attempts.store: git-ref` for those targets.

What it adds:

- No second file store.
- Records follow the repository to any machine, since they are refs on the
  remote (`src/update/ref-attempts.ts`). This needs the per-target binding
  D-0005 adds: today the store and lease are built once, on the project
  root's remote (`src/defaults.ts`).

What it costs:

- A file-store user must switch before updating a non-root target. The run
  refuses one under `file`, and the message names the key to set.
- `git-ref` also turns on the per-branch update lease, and needs a remote that
  accepts refs outside `refs/heads` and `refs/tags` (`src/config.ts`).
- It breaks D-0005's criterion that existing file-store users see no change.

Owner (2026-11-22): the file store in the state home for now. Take this
up if `git-ref` becomes the default store, or if the second store causes
trouble.
