---
id: D-01
type: decision
state: proposed
created: 2026-11-22
---

# D-01: Name

## Decision

- The package is `@osdlc/json-canvas-vue` on npm. The owner confirms the name before the first
  release, so the state of this note is `proposed`.
- It is the Vue 3 renderer and editor for the JSON Canvas format. It sits on
  [`@osdlc/json-canvas-core`](../../../../json-canvas-core/README.md), which holds the model and the
  operations. The Vue board is the part that draws and takes input.

## Alternatives

- `json-canvas-vue` without a scope was free on npm. It was set aside to match the other packages
  of this repository, which share the `@osdlc` scope.
- `vue-json-canvas` reads as a Vue-first name, but the home names a framework binding
  `<thing>-vue`, as `markdown-render-vue` does.
- Names under another scope were free too and were set aside for the same reason as the first.

## Why

- The name says what the package is, follows the home's `<thing>-vue` pattern, and pairs with
  `@osdlc/json-canvas-core`.
- It was free on npm when it was chosen.

## Consequences

- The README says in one sentence that the format is the one Obsidian Canvas writes. The name
  "JSON Canvas" is used to name the format, and the package does not claim to be a product of the
  format's authors.
