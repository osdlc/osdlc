---
id: D-01
type: decision
state: proposed
created: 2026-11-22
---

# D-01: Name and scope

## Decision

- The package is `@osdlc/json-canvas-core` on npm. The owner confirms the name before the first
  release, so the state of this note is `proposed`.
- It holds what any program needs to work with a JSON Canvas document: the format's types, a
  validator for untrusted input, an operation engine with undo and redo, geometry helpers and a view
  model for selection, pan and zoom.
- It draws nothing and imports no UI framework. `@osdlc/json-canvas-vue` is the Vue 3 renderer built
  on it.

## Alternatives

- `json-canvas-core` without a scope was free on npm. It was set aside to match the other packages of
  this repository, which share the `@osdlc` scope.
- `json-canvas` would suggest the format itself, or a renderer. This package is neither. The word
  "core" says it is the part a renderer or an editor builds on.

## Why

- The name says what the package is and pairs with `@osdlc/json-canvas-vue`.
- It was free on npm when it was chosen, and no other package on npm has a confusing name.

## Consequences

- The `obsidian` keyword is not used: Obsidian is a product of a third party. The README says in one
  sentence that the format is the one Obsidian Canvas writes.
