# path-guard planning

The words `@osdlc/path-guard` uses with a fixed meaning. The
[README](../../README.md) says how to use the package. This folder says what
the terms mean.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there. The Rust crate [`path-guard`](../../../../rust/path-guard/docs/planning/README.md)
shares them.

## Layout

| Folder             | Holds                                   | Ids     |
| ------------------ | --------------------------------------- | ------- |
| [`terms/`](terms/) | Words the docs use with a fixed meaning | `TM-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Entries link to each other with relative links.

Each entry has a `state`. A term is `accepted`, or `superseded` once it no
longer describes the package.

## Terms

- [TM-01](terms/TM-01-relative-path.md): Relative path
- [TM-02](terms/TM-02-lexical.md): Lexical
- [TM-03](terms/TM-03-path-containment.md): Path containment
- [TM-04](terms/TM-04-escape.md): Escape
- [TM-05](terms/TM-05-separator-folding.md): Separator folding
- [TM-06](terms/TM-06-segment.md): Segment
- [TM-07](terms/TM-07-real-path.md): Real path
- [TM-08](terms/TM-08-path-resolver.md): Path resolver
