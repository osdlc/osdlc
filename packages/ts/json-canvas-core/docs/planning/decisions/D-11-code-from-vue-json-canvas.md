---
id: D-11
type: decision
state: accepted
created: 2026-11-22
---

# D-11: Some code descends from vue-json-canvas, and its MIT notice ships

## Decision

The package ships `THIRD-PARTY-NOTICES`, which holds the MIT licence of
[vue-json-canvas](https://github.com/wujieli0207/vue-json-canvas) and names the code that descends
from it. The README's Licence section points to the file. The package's own licence stays
`MIT OR Apache-2.0`.

## Why

- Three parts of this package match vue-json-canvas closely enough to descend from it:
  `getAnchorPoint` in `src/utils/getAnchorPoint.ts`, the node, edge and canvas types in
  `src/types.ts`, and the zoom constants in `src/config.ts`.
- This was checked on 2026-11-22 by comparing every source line of vue-json-canvas at commit
  `30a318f` with the first files of this package and its Vue renderer, and with the files now. A
  line counted when it was at least 24 characters long and not an import. Of that repository's 382
  such lines, 109 were in the first files of the two packages, and 8 are in this package's `src/`
  now.
- The MIT licence asks that its notice go with every copy of the code, or of a large part of it. A
  file in the tarball does that.
- The operation engine, the history, the geometry, the validation and the view model were written
  for this package. vue-json-canvas has none of them.

## Consequences

- `THIRD-PARTY-NOTICES` is in `files`, so every release carries it.
- [`@osdlc/json-canvas-vue`](../../../../json-canvas-vue/README.md) holds more of the same code and
  ships the same notice.
- A rewrite of the three parts does not remove the notice by itself. Remove it only after a new
  comparison finds nothing left.
