# config-layers planning

Why `@osdlc/config-layers` has the shape it has. The [README](../../README.md)
says how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there. The Rust twin is the crate `config-layers`, in
`packages/rust/config-layers`.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Each decision has a `state`: `accepted` or
`superseded`. A superseded decision names the one that replaces it.

## Decisions

- [D-01](decisions/D-01-machine-file-never-throws.md): The machine file never
  throws
- [D-02](decisions/D-02-schema-walk-reads-zod-def.md): The schema walk reads
  Zod's `_def`
- [D-03](decisions/D-03-no-config-search.md): No config search
- [D-04](decisions/D-04-yaml-reading-shared-with-rust.md): YAML reading rules
  shared with the Rust crate
