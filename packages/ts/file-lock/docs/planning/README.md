# file-lock planning

Why `@osdlc/file-lock` has the shape it has. The [README](../../README.md) says
how to use the package.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. A decision is `proposed`, `accepted` or `superseded`.

## Decisions

- [D-01](decisions/D-01-one-mechanism-two-shapes.md): One mechanism, two shapes
