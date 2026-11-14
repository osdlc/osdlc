# @osdlc/harness-knowledge

## 0.1.2

### Patch Changes

- d2d2486: The data is recompiled from the harness reference corpus in osdlc/osdlc
  (`packages/corpora/harness-reference`). The values are unchanged. Each `basis` link, and the
  `corpus` block, now name osdlc/osdlc and the commit the corpus was compiled at, in place of
  osdlc/skillwright.

## 0.1.1

### Patch Changes

- e54b989: The README says where the data now comes from: the harness reference corpus in osdlc/osdlc
  (`packages/corpora/harness-reference`), which came from osdlc/skillwright. The data is unchanged,
  and its `basis` links still name the osdlc/skillwright commit it was compiled at. `sync` compiles
  the corpus in this repository in place of downloading an osdlc/skillwright release.

## 0.1.0

### Minor Changes

- 20dfeb4: First release. The compiled harness facts from osdlc/skillwright (`data/harness-knowledge.json` and its JSON Schema), TypeScript types for the file, `loadKnowledge`, `lookup` (by harness, subject, version, platform and model, with `AmbiguousValue`), `fact`, and a `sync` script that copies the compiled files from a directory or a skillwright release. Every value carries a `basis` link.
