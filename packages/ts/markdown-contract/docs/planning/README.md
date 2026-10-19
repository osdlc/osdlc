# markdown-contract planning

Why `@osdlc/markdown-contract` has the shape it has. The
[README](../../README.md) says how to use the package. This folder says why.

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

- [D-01](decisions/D-01-name.md): Package name
- [D-02](decisions/D-02-api-sign-off-0.3.0.md): API sign-off for 0.3.0
- [D-03](decisions/D-03-stability-tiers.md): Stability tiers
- [D-04](decisions/D-04-yaml-contract-version-2.md): YAML contract version 2
  only
- [D-05](decisions/D-05-platforms-and-runtimes.md): Platforms and runtimes
