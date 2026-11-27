---
id: D-02
type: decision
state: proposed
created: 2026-11-22
---

# D-02: Alternatives, and why this package continues

## Decision

The answer is to continue and publish. This is proposed: the owner confirms it. No spike was run
for it. [T-04](../tasks/T-04-try-the-alternatives.md) holds the check that would test it.

## What else exists

Two packages do the same core job. The facts are from their published packages in November 2026.

| Package                         | Covers                                                                                                                                                   | Does not cover                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@type32/obsidian-bases-parser` | Parses, writes and edits `.base` files. The expression language, and queries over a `BaseHost` the caller supplies. No file system. Follows Obsidian 1.15.1 as observed. | A command line, a vault scanner or index, paged ad hoc queries, and `base` blocks in markdown.          |
| `mdbasequery`                   | `.base` files and queries built from YAML or flags, as a command line and a TypeScript library, over a vault directory.                                  | An in-memory index as input, and editing `.base` files. It is at 0.0.x.                                  |

Other packages cover half the job (an expression parser with no `.base` files), run only inside
Obsidian, or render a base in a site.

## Why this package continues

- It runs over `VaultIndex` from `@osdlc/markdown-vault`, which a caller builds from a folder or
  from data. Using `@type32/obsidian-bases-parser` means writing a `BaseHost` over that index.
- `queryVault` pages and sorts an ad hoc expression and returns the total, the shape a UI list
  needs. Neither package has it.
- It has a command line that reads the index the same way, and `extractEmbeddedBases` for
  `base` blocks in markdown.
- Its first consumer is built on it, so adopting another engine would cost a port with no gain in
  what that consumer shows.

## What it costs

`@type32/obsidian-bases-parser` follows Obsidian 1.15.1 as observed. This package follows the 1.9 to
1.13 documentation ([D-05](D-05-bases-behaviour.md)), so it lags in behaviour that changed after.

## Would reopen it

A host over `VaultIndex` for `@type32/obsidian-bases-parser` that covers what the first consumer
shows. Then this package would be the thin layer that supplies the index, the paging and the
command line, or would be retired.
