# markdown-vault-query planning

Why `@osdlc/markdown-vault-query` has the shape it has, and the work still open on it. The
[README](../../README.md) says how to use the package.

These files are maintained in [osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a
pull request there. The package began in sksizer/dev (a private repository) as `obsidian-bases`.

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

- [D-01](decisions/D-01-name.md): Name (proposed)
- [D-02](decisions/D-02-alternatives.md): Alternatives, and why this package continues (proposed)
- [D-03](decisions/D-03-api-and-stability-tiers.md): The API of the first release and its
  stability tiers (proposed)
- [D-04](decisions/D-04-version-line-and-home.md): Version line, home and runtimes
- [D-05](decisions/D-05-bases-behaviour.md): Which Obsidian Bases behaviour the package follows

## Open tasks

- [T-01](tasks/T-01-embedded-base-fences.md): `extractEmbeddedBases` matches fences too loosely
- [T-02](tasks/T-02-windows.md): Test on Windows
- [T-03](tasks/T-03-newer-bases-behaviour.md): Compare with Obsidian releases after 1.13
- [T-04](tasks/T-04-try-the-alternatives.md): Try the notes view on `@type32/obsidian-bases-parser`
- [T-05](tasks/T-05-corpus-model.md): Move onto the corpus model
