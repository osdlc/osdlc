---
id: D-09
type: decision
state: accepted
created: 2026-11-22
---

# D-09: Some code descends from vue-json-canvas, and its MIT notice ships

## Decision

The package ships `THIRD-PARTY-NOTICES`, which holds the MIT licence of
[vue-json-canvas](https://github.com/wujieli0207/vue-json-canvas) and names the code that descends
from it. The README's Licence section points to the file. The package's own licence stays
`MIT OR Apache-2.0`.

## Why

- The board started from vue-json-canvas. Three files still hold lines from it: the board component
  in `src/components/Canvas/index.vue`, the node component in `src/components/CanvasNode/index.vue`
  and the stylesheet in `src/index.css`.
- This was checked on 2026-11-22 by comparing every source line of vue-json-canvas at commit
  `30a318f` with the first files of this package and of `@osdlc/json-canvas-core`, and with the
  files now. A line counted when it was at least 24 characters long and not an import. Of that
  repository's 382 such lines, 109 were in the first files of the two packages, and 80 are in this
  package's `src/` now.
- The MIT licence asks that its notice go with every copy of the code, or of a large part of it. A
  file in the tarball does that.
- vue-json-canvas draws a canvas, with pan, zoom, node dragging and markdown text. It has no
  resizing, text editing, undo and redo, read-only mode, node components, panels or sanitizing.
  Those were written for this package.

## Consequences

- `THIRD-PARTY-NOTICES` is in `files`, so every release carries it.
- [`@osdlc/json-canvas-core`](../../../../json-canvas-core/README.md) holds a few lines of the same
  code and ships the same notice.
- A rewrite of the three files does not remove the notice by itself. Remove it only after a new
  comparison finds nothing left.
