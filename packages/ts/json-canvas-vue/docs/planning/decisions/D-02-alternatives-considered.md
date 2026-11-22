---
id: D-02
type: decision
state: proposed
created: 2026-11-22
---

# D-02: Alternatives considered

## Decision

Publish this package. The owner confirms the answer, so the state of this note is `proposed`. The
answer is `continue`, not `adopt` and not `drop`.

## Alternatives

| Candidate | What it is | Why it does not replace this package |
| --- | --- | --- |
| `@type32/jsoncanvas-editor` | A Vue and Nuxt editor for the same format, with snapping, alignment, undo, clipboard and PNG export. MIT. | It builds on Nuxt UI and Tailwind (a peer dependency on `@nuxt/ui`), and it has no entry for an app without them. It has no separate framework-free model. It was released a short time before this note was written. |
| `@json-canvas-viewer/vue` and `json-canvas-viewer` | A viewer for a canvas, as a Vue component. MIT. | A viewer. It documents no editing. |
| `@vue-flow/core` | A generic node and edge editor for Vue. MIT. | It is not the JSON Canvas format: it has no `.canvas` import and no document-level undo. |
| `@osdlc/json-canvas-core` alone | The model, validation, operations, history and view model, with no UI. | It draws nothing. A host that draws its own canvas uses it directly; this package is the board on top of it. |

Renderers for other frameworks (React, Svelte) exist and do not apply to a Vue app.

## Why

- The package has no UI-kit requirement, a separate model with undo, host-supplied node components,
  a sanitizing markdown seam and a read-only mode.
- The closest candidate for the same job is an editor that needs Nuxt UI and Tailwind. An app
  without them has no option today.

## Consequences

- The README's comparison section names `@type32/jsoncanvas-editor` and the viewer, and states what
  each covers. Revisit this note if that editor gains a framework-light entry.
