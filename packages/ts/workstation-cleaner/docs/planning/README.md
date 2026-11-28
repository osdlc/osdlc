# workstation-cleaner planning

Why `@osdlc/workstation-cleaner` has the shape it has. The [README](../../README.md)
says how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder                 | Holds                   | Ids      |
| ---------------------- | ----------------------- | -------- |
| [`backlog/`](backlog/) | Ideas not yet scheduled | `B-nnnn` |

Ids are numbers in order of writing, zero-padded to four digits so they sort.
They are never reused.

How the package is built today is in [how-it-works.md](../guide/how-it-works.md).

## Backlog

- [B-0001](backlog/B-0001-unattended-cleaning.md): Bring back unattended
  cleaning, profiles and the claude-code plugin
- [B-0002](backlog/B-0002-root-only-stores.md): Clean stores that only root
  can clean
