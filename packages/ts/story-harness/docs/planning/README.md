# story-harness planning

Why `@osdlc/story-harness` has the shape it has. The [README](../../README.md)
says how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder | Holds | Ids |
|---|---|---|
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Each decision has a `state`: `proposed` until the
owner signs it off, then `accepted`, or later `superseded`. A superseded
decision names the one that replaces it.

## Decisions

- [D-01](decisions/D-01-name-and-scope.md): Name and scope
- [D-02](decisions/D-02-version-line-and-stability.md): Version line and stability
- [D-03](decisions/D-03-baselines-in-a-pinned-container.md): Baselines in a pinned container
- [D-04](decisions/D-04-entries-and-command.md): Entries, the command and the peer dependency
- [D-05](decisions/D-05-platforms-and-runtimes.md): Platforms and runtimes
- [D-06](decisions/D-06-licence.md): Licence
