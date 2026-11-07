# repo-cleaner planning

Why `@osdlc/repo-cleaner` has the shape it has. The [README](../../README.md)
says how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there. Decisions that span repo-cleaner and other packages, such as
[D-L7N5](../../../../../docs/decisions/D-L7N5-host-cleaner.md) for host-cleaner,
are in the root [`docs/decisions/`](../../../../../docs/decisions/README.md).

## Layout

| Folder                     | Holds                                         | Ids               |
| -------------------------- | --------------------------------------------- | ----------------- |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | random, `D-XXXX` |

Ids are random keys, so parallel branches do not collide. A record that
started in sksizer/dev keeps the id it had there. Each decision has a `state`:
`accepted` or `superseded`. A superseded decision names the one that replaces
it.

## Decisions

- [D-RSWP](decisions/D-RSWP-standalone.md): repo-cleaner is a standalone tool;
  a host adds what it knows through `annotate`
