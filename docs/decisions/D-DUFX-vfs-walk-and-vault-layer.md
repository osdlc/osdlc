# D-DUFX: A general walk in `vfs-walk`, vault rules in `markdown-vault-fs`

Accepted 2026-11-04. Part of
[D-YRKH](D-YRKH-one-implementation-per-vault-concept.md).

## Decision

- **New crate `vfs-walk`:** a sorted walk through `vfs-seam`, with prune
  and skip lists, an entry filter, a symlink policy, an error policy and
  modification times. It knows nothing about Markdown or vaults; the caller
  passes its rules in.
- **`markdown-vault-fs` is the vault layer on top:** notes versus
  attachments, visibility presets, the `_system/` rules and the vault's
  excluded files. It keeps its walk functions as thin wrappers.
- **Every vault walk honours excluded files.** `markdown-vault-fs` reads the
  vault's list (Obsidian's `userIgnoreFilters` in `.obsidian/app.json`, for
  example) and passes it to `vfs-walk` as a filter. Callers can pass their
  own rules or turn it off.

## Why

Most of the old `markdown-vault-fs` was a general walker. Code that only
walks files (assets, scripts, attachments) should not depend on vault rules.

## Options rejected

- The walk inside `vfs-seam`: walk changes would force a breaking release
  of the trait every crate depends on.
- The walk inside `markdown-vault-fs`: a plain file walk would depend on
  vault rules.

## Consequences

- One more crate to publish.
- `VfsResolver` (the path-containment guard over a `Vfs`) stays in
  `markdown-vault-fs` for now; it moves to `path-guard` if a non-vault
  user appears.

## Reopen if

No caller uses `vfs-walk` without `markdown-vault-fs`.
