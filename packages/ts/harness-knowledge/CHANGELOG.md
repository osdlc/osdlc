# @osdlc/harness-knowledge

## 0.1.0

### Minor Changes

- 20dfeb4: First release. The compiled harness facts from osdlc/skillwright (`data/harness-knowledge.json` and its JSON Schema), TypeScript types for the file, `loadKnowledge`, `lookup` (by harness, subject, version, platform and model, with `AmbiguousValue`), `fact`, and a `sync` script that copies the compiled files from a directory or a skillwright release. Every value carries a `basis` link.
