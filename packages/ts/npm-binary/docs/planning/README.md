# npm-binary planning

Why `@osdlc/npm-binary` has the shape it has. The [README](../../README.md)
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

- [D-01](decisions/D-01-launcher-and-platform-packages.md): A launcher package
  and one package per platform, selected by npm
- [D-02](decisions/D-02-launcher-signals-and-exit.md): How the launcher passes
  signals and the exit status through
- [D-03](decisions/D-03-manifest-templates.md): Templates fix key order; the
  arguments fix identity
- [D-04](decisions/D-04-name-api-and-first-version.md): The name, the public
  API and the first version
