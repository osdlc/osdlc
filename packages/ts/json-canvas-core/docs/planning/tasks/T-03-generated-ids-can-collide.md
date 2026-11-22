---
id: T-03
type: task
state: open
created: 2026-11-22
---

# T-03: Generated ids can collide

## Goal

A node or edge id made by the engine is unique on the canvas it is made for.

## Today

`createNode`, `createEdge` and `duplicateNodes` make ids from `Math.random`, 12 hex digits. A
`createNode` or `createEdge` with a given id is checked against the canvas, but a generated id is
not, and `duplicateNodes` does not check at all. A collision is unlikely and silent.

## Approach

- [ ] Draw a new id until it is not on the canvas, or use a stronger source such as `crypto.randomUUID`
      where the runtime has one.
- [ ] Keep `generateId` internal, as [D-02](../decisions/D-02-api-for-the-first-release.md) records.

## Acceptance criteria

- [ ] A test with a stubbed generator that repeats an id gets a different id the second time.
- [ ] No operation can produce two nodes with one id.
