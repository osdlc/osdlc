# @osdlc/harness-knowledge

## 0.2.0

### Minor Changes

- ee8458a: The data is compiled again from the harness reference. It holds 1,150 values, up from 721: 427 new
  answers across the fourteen harnesses, and the answers and versions that were brought up to date.
  `fact` and `lookup` now return a value for many harness and subject pairs that returned
  `undefined` before.
  
  Some values changed. OpenCode `instructions/claude-md` is now two values, one for versions before
  2.0.0 and one from 2.0.0. Gemini CLI `cli/session-id` no longer says the id is a UUID. DeepSeek
  Harness `plugins/marketplace` is now supported. Thirty DeepSeek Harness values dropped from strong
  to moderate.

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
