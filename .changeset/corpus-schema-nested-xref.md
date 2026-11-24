---
"@osdlc/corpus-schema": minor
---

`x-ref` and `x-ref-form` may sit at any depth: on a property of a nested object, on the items of a list nested in one, and on a list of objects' own properties, such as `hasEvidenceLines[].hasEvidenceItems[]`. Each value is checked as a top-level one is. An error line names the field with its path, such as `lines.0.items`. In `loadCorpus()`, a reference's `field` is the dotted property names and its `pointer` the full JSON Pointer, such as `/lines/0/items/1`. Other positions, such as under `allOf`, are still an error.
