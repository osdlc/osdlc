# pr-update planning

Why `@osdlc/pr-update` has the shape it has. The [README](../../README.md)
says how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder                     | Holds                                         | Ids      |
| -------------------------- | --------------------------------------------- | -------- |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nnnn` |
| [`backlog/`](backlog/)     | Ideas not yet scheduled                       | `B-nnnn` |

Ids are numbers in order of writing, zero-padded to four digits so they sort.
They are never reused.

## Decisions

- [D-0001](decisions/D-0001-engine-hosts-and-one-judgement-seam.md): pr-update
  is a host-neutral update engine with one judgement seam

## Backlog

- [B-0001](backlog/B-0001-route-the-repair-agent-through-model-routing-profiles.md):
  Route the repair agent through model-routing profiles
