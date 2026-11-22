---
id: D-02
type: decision
state: proposed
created: 2026-11-22
---

# D-02: The API for the first release

## Decision

Proposed: the first release exports thirteen items from one entry point, `@osdlc/markdown-vault`,
and all are stable (see [D-03](D-03-version-line-and-stability.md)). The owner confirms the
surface before the first release.

| Group     | Items                                                                              |
| --------- | ---------------------------------------------------------------------------------- |
| Functions | `scanVault`, `createVaultIndex`, `createLinkResolver`, `parseFrontmatter`, `extractLinks`, `extractInlineTags` |
| Model     | `VaultIndex`, `VaultNote`, `FileMeta`, `LinkRef`                                   |
| Options   | `ScanOptions`, `ExternalNote`, `CreateVaultIndexOptions`                           |

- `extractInlineTags(body, options?)` takes its dialect as `{ tagDialect }`, like `scanVault`.
  Before the first release it took the dialect as a second positional argument. That is a breaking
  change, and no published version carried the old form.
- The model types are plain interfaces. Any provider that produces the same shape can stand in for
  the scanner, and `createVaultIndex` is one.
- Every option type is an interface of optional members, so a new option does not break a caller.
- The package defines no error type. `scanVault` rejects with what Node throws for an unreadable
  root, and `parseFrontmatter` returns `{}` for malformed YAML.
- `frontmatterTags` and `resolveVaultLinks` are shared between the two builders and are not
  exported from the entry point.

## Why

- The same dialect option on both functions means one thing is learned once, and a positional
  argument cannot grow a second option.
- A small surface is easier to keep stable on the 0.x line.

## Consequences

- A change to any item above is a breaking change and ships in a new minor release.
