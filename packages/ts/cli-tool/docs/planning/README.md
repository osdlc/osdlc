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

## Backlog

- [B-01](backlog/B-01-one-launch-pattern.md): CLI launch: one pattern across
  cli-tool and sdlc, and the decisions left
