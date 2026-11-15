---
id: D-01
type: decision
state: accepted
created: 2026-11-08
---

# D-01: Name

Accepted. The owner chose the name on 2026-11-08.

## Decision

- The spec is corpus-schema. Its root file is `<name>.corpus-schema.md`, `.yaml` or `.json`, where
  `<name>` is the corpus's name, and the root file's version key is `corpus-schema`.
- The package is `@osdlc/corpus-schema`, published to npm from this repository,
  `packages/ts/corpus-schema`.
- Its command is `corpus-schema`, with one verb in version 0: `corpus-schema validate`.
- The spec's family in `packages/conformance/` is `corpus-schema` too.

## Why

- The name says what the spec adds on top of a corpus. In osdlc a corpus is any folder of Markdown
  notes and the files they link to ([D-ODPP](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-ODPP-markdown-corpus.md)).
  corpus-schema is what such a folder can declare about itself: its types and their schemas.
- It keeps "corpus" as osdlc's word for the folder, rather than bringing in a second word for it.
- `corpus-schema` is free on npm and on crates.io, so a later Rust implementation can use the same
  name.
- It does not clash with the `markdown-corpus` crate, which models any corpus and keeps its name,
  or with MarkdownDB (`mddb`), which indexes Markdown for queries.

## Other names

The first name was markdown-db. It sat close to MarkdownDB (`mddb`, `@flowershow/markdowndb`), the
unscoped npm package `markdown-db` and `@synstack/markdown-db`, and the README had to say it was
none of them. It also suggested a database, which this is not: it is a format and a validator.

## Consequences

- The design record in `docs/parley/markdown-db-v0.*` keeps its old file names. A line at its top
  says the spec is now called corpus-schema.
- Nothing was published under the old name, so no corpus or user has to migrate.
