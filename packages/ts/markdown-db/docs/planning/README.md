# markdown-db planning

Why `@osdlc/markdown-db` has the shape it has. The [README](../../README.md) says how to use the
package, and the [markdown-db spec](../../../../conformance/markdown-db/SPEC.md) states the format
it checks. This folder says why the package is shaped as it is.

These files are maintained here, in [osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue
or a pull request there.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort. They are never
reused. Each decision has a `state`: `proposed`, `accepted` or `superseded`. A proposed decision
waits for the owner's sign-off.

## Decisions

- [D-01](decisions/D-01-name.md): Name
- [D-02](decisions/D-02-version-line-and-stability.md): Version line and stability
