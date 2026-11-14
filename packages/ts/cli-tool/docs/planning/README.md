# cli-tool planning

Why `@osdlc/cli-tool` has the shape it has. The [README](../../README.md) says
how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |
| [`backlog/`](backlog/)     | Ideas not yet scheduled                       | `B-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Each decision has a `state`: `accepted` or
`superseded`. A superseded decision names the one that replaces it.

## Decisions

- [D-01](decisions/D-01-failures-share-one-exit-table.md): Classified failures
  share one message form and one exit table
- [D-02](decisions/D-02-devlink-state-dir-is-a-home-path.md): A devlink
  spec's own state directory is a path under the home
- [D-03](decisions/D-03-devlink-dead-link-falls-back-through-a-candidates-file.md):
  A dead devlink link can fall back through a plain-text candidates file
- [D-05](decisions/D-05-node-checkouts-run-their-ts-source.md): A node
  checkout runs its TypeScript source through Node's type stripping

## Backlog

- [B-01](backlog/B-01-one-launch-pattern.md): CLI launch: one pattern across
  cli-tool and sdlc, and the decisions left
