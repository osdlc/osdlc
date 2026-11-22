# diffkit planning

Why `@osdlc/diffkit` has the shape it has, and the work still open on it. The
[README](../../README.md) says how to use the package.

These files are maintained in [osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a
pull request there.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |
| [`tasks/`](tasks/)         | Work, open or done                            | `T-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort. They are never
reused. Entries link to each other with relative links.

Each entry has a `state`. A decision is `proposed`, `accepted` or `superseded`; a superseded
decision names the one that replaces it. A task is `open` or `done`.

## Decisions

- [D-01](decisions/D-01-name-and-bin.md): The name and the `diffkit` binary
- [D-02](decisions/D-02-api-and-stability-tiers.md): The API for the first release and its
  stability tiers
- [D-03](decisions/D-03-version-line.md): The version line
- [D-04](decisions/D-04-what-prep-computes.md): What `prep` computes and what it leaves to a
  reviewer
- [D-05](decisions/D-05-no-symlink-following.md): The checkout is read without following symlinks

## Open tasks

- [T-01](tasks/T-01-share-the-even-split-rule.md): One copy of the even-split rule
- [T-02](tasks/T-02-windows-support.md): Test on Windows
