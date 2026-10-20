# path-guard planning

Why `@osdlc/path-guard` has the shape it has, and the words it uses with a
fixed meaning. The [README](../../README.md) says how to use the package.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there. The Rust crate [`path-guard`](../../../../rust/path-guard/docs/planning/README.md)
shares them.

## Layout

| Folder                     | Holds                                         | Ids     |
| -------------------------- | --------------------------------------------- | ------- |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn`  |
| [`tasks/`](tasks/)         | Work, open or done                            | `T-nn`  |
| [`terms/`](terms/)         | Words the docs use with a fixed meaning       | `TM-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Entries link to each other with relative links.

Each entry has a `state`. A decision is `accepted` or `superseded`, and a
superseded decision names the one that replaces it. A task is `open` or
`done`. A term is `accepted`, or `superseded` once it no longer describes the
package.

## Decisions

- [D-01](decisions/D-01-package-name.md): Package name
- [D-02](decisions/D-02-version-line-and-stability.md): Version line and
  stability
- [D-03](decisions/D-03-platforms.md): Platforms
- [D-04](decisions/D-04-error-kind-growth.md): How `PathErrorKind` grows
- [D-05](decisions/D-05-kept-names-for-0-2.md): `isInside` and
  `realpathOrSelf` keep their names for 0.2.x

## Open tasks

- [T-02](tasks/T-02-rust-windows-dot-dot-fold.md): The Rust crate folds `..`
  as text on Windows
- [T-03](tasks/T-03-is-inside-sibling-prefix-test.md): Test that `isInside`
  rejects a sibling-prefix directory

## Done tasks

- [T-01](tasks/T-01-browser-safe-lexical-entry.md): A browser-safe
  `./lexical` entry point

## Terms

- [TM-01](terms/TM-01-relative-path.md): Relative path
- [TM-02](terms/TM-02-lexical.md): Lexical
- [TM-03](terms/TM-03-path-containment.md): Path containment
- [TM-04](terms/TM-04-escape.md): Escape
- [TM-05](terms/TM-05-separator-folding.md): Separator folding
- [TM-06](terms/TM-06-segment.md): Segment
- [TM-07](terms/TM-07-real-path.md): Real path
- [TM-08](terms/TM-08-path-resolver.md): Path resolver
