# markdown-vault-astro planning

Why `@osdlc/markdown-vault-astro` has the shape it has. The [README](../../README.md) says how to use the
package. This folder says why.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort. They are never reused.
Each decision has a `state`: `accepted` or `superseded`; a superseded decision names the one that
replaces it.

## Decisions

- [D-01](decisions/D-01-name-and-home.md): Name and home.
- [D-02](decisions/D-02-version-and-stability.md): First version and stability.
- [D-03](decisions/D-03-zod-peer-dependency.md): `zod` is a peer dependency.
- [D-04](decisions/D-04-platforms-runtimes-and-dev-link.md): Platforms, runtimes and the dev command.
