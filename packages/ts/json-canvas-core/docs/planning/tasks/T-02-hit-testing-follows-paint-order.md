---
id: T-02
type: task
state: open
created: 2026-11-22
---

# T-02: Hit testing follows paint order

## Goal

`CanvasViewModel.findNodeAtPoint` returns the node a renderer shows on top.

## Today

It tests the canvas array from the last node to the first. A renderer that paints with
`sortNodesForRendering` puts groups below the other nodes, so a group that comes late in the array
can win over a node drawn on top of it.

## Approach

- [ ] Test the nodes in the order `sortNodesForRendering` gives, last first.
- [ ] Keep the result for a canvas with no groups unchanged.

## Acceptance criteria

- [ ] A test with a group after a node it contains finds the node at a point on both.
- [ ] The existing view model tests still pass.
