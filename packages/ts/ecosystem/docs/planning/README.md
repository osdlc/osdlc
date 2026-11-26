# ecosystem planning

Why `@osdlc/ecosystem` has the shape it has. The [README](../../README.md)
says how to use the package and the [guide](../guide/finding-checkouts.md)
shows it in use. This folder says why.

The package itself was decided at the repository level:
[D-ZVIA](../../../../../docs/decisions/D-ZVIA-osdlc-ecosystem-package.md)
says which settings osdlc tools share live here, and the
[machine-files standard](../../../../../standards/machine-files.md) says where
the family's files go. The decisions below are the package's own.

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

- [D-01](decisions/D-01-the-repositories-api.md): The first `./repositories` API
