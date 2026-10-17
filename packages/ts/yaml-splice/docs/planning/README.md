# yaml-splice planning

Why `@osdlc/yaml-splice` has the shape it has. The [README](../../README.md)
says how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Each decision has a `state`: `accepted` or
`superseded`. A superseded decision names the one that replaces it.

## Decisions

- [D-01](decisions/D-01-name-and-scope.md): Name and scope
- [D-02](decisions/D-02-version-line-and-stability.md): Version line and stability
- [D-03](decisions/D-03-committed-wasm.md): The committed WebAssembly and its check
- [D-04](decisions/D-04-platforms-runtimes-and-package-contents.md): Platforms, runtimes and package contents
- [D-05](decisions/D-05-case-insensitive-keys.md): Keys match case-insensitively
- [D-06](decisions/D-06-licence.md): Licence
