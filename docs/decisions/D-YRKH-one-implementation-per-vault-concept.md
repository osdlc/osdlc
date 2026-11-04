# D-YRKH: One implementation per vault concept

Accepted 2026-11-04. Came out of skillwright's architecture review
([skillwright#29](https://github.com/osdlc/skillwright/pull/29)).

## Decision

- **Every vault concept lives in exactly one osdlc crate:** file access,
  the walk, excluded files, link parsing, link resolution, the link graph
  and the frontmatter split. Tools depend on that crate and keep no copy.
- **A tool keeps only what is its own,** such as skillwright's skill calls
  or determined's sidecar files.
- **Gaps are fixed here, as options.** A tool that needs different
  behaviour adds an option upstream instead of a local copy. Defaults stay
  as they are.
- **Sync now, async later.** The APIs are sync. An async layer, when
  needed, wraps them at the edges.
- **APIs may change to fit.** `markdown-vault-fs`, `markdown-link`,
  `markdown-contract` and `markdown-relink` take breaking minor releases
  where needed.

The crates: [D-JPYM](D-JPYM-vfs-seam.md) (file access),
[D-DUFX](D-DUFX-vfs-walk-and-vault-layer.md) (the walk),
[D-ODPP](D-ODPP-markdown-vault.md) (the vault model).

## Why

There were four vault link models: determined's `LinkGraph`,
`markdown-relink`'s `VaultFacts`, skillwright core's own scanner and
resolver, and the walk behind determined's `VaultGraph`. They drifted, so
the same vault resolved differently in different tools.

## Options rejected

- Each tool keeps its own model and shares only parsing.
- Write a new vault model instead of extracting the most complete one.

## Consequences

- Every tool resolves a vault's links the same way.
- A fix in one crate reaches every tool on the next release.

## Reopen if

A tool's needs can't be met by an option without making the shared crate
worse for the others.
