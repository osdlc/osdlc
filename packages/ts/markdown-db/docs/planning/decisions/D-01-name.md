---
id: D-01
type: decision
state: proposed
created: 2026-11-08
---

# D-01: Name

Pending the owner's sign-off.

## Decision

- The package is `@osdlc/markdown-db`, published to npm from this repository,
  `packages/ts/markdown-db`.
- Its command is `markdown-db`, with one verb in version 0: `markdown-db validate`.
- The README says in one sentence that it is not MarkdownDB (`mddb`, from datopian and
  flowershow) and not the unscoped npm package `markdown-db`.

## Why

- The name is the format's name: the package is the reference validator for the markdown-db
  spec, and the root file is `markdown-db.md`. A reader who meets the format finds the package by
  the same word.
- `@osdlc/markdown-db` is free on npm. The scope keeps it apart from the unscoped `markdown-db`
  (a 2022 package that turns Markdown into a JSON database, with the same command name) and from
  `@synstack/markdown-db`.
- MarkdownDB (`mddb`, `@flowershow/markdowndb`) is better known and close in name. It indexes
  Markdown for queries and checks no schemas. The disambiguation line in the README covers the
  overlap.
- The other choice was a new name for both the format and the package. That would break the
  root-file name and every corpus that uses it, for a clash the scope already avoids on npm.

## Consequences

- Installing the unscoped `markdown-db` and this package globally gives two `markdown-db`
  commands. The README's `npx @osdlc/markdown-db` form avoids that.
- Renaming later means renaming the root file in the spec too, so the name should be settled
  before the first release.
