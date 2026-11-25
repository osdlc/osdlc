---
id: T-01
type: task
state: open
created: 2026-11-22
---

# T-01: A per-board markdown renderer

## Goal

Two boards on one page can use different markdown renderers, and no registry is shared state.

## Today

The renderer registry is module-wide (see [D-08](../decisions/D-08-markdown-seam-and-sanitizing.md)).
Every board on a page uses the one active renderer, and `setActiveRenderer` changes all of them. The
five registry functions are `@experimental` for this reason.

## Approach

- [ ] Add a `renderer` prop to `JsonCanvas`, passed down to each node, that takes a
      `MarkdownRenderer` for that board.
- [ ] Keep `registerMarkdownRenderer` and `setActiveRenderer` as the default for a board with no
      `renderer`, or remove them in the same 0.x release that adds the prop.
- [ ] Decide what `renderedMarkdown` becomes. It reads the active renderer today.

## Acceptance criteria

- [ ] A test mounts two boards with different renderers and checks each draws its own output.
- [ ] The README's markdown section and its experimental list are updated.
