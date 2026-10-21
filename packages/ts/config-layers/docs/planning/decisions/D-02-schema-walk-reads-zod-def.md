---
id: D-02
type: decision
state: accepted
created: 2026-10-20
---

# D-02: The schema walk reads Zod's `_def`

## Decision

The helpers that walk a schema (`leafSchema`, `shapeOf`, `unwrapSchema`,
`describeShape`, `jsonSchemaOf` and the scaffold and reference renderers) read
Zod 4's private `_def` object. They match on its `type` tag by name and never
use `instanceof`.

`zod` is a peer dependency (`^4`), not a dependency.

## Why

- Zod has no public way to ask what a schema wraps, which fields an object has
  or what an enum allows. The explain, edit, scaffold and reference tools need
  all three.
- A consumer's tree can hold two copies of zod. `instanceof` fails across them.
  A tag name works on both.
- A peer dependency lets the tool and this package share one copy where they
  can.

## Consequences

- A zod release may move the `_def` layout. A tripwire test fails when it
  does, and `tests/zod-copy.test.ts` loads a config through a second copy of
  zod.
- The supported range is Zod 4. A change of the layout in a later 4.x release
  is fixed here.
