---
'@osdlc/yaml-splice': minor
---

Nested edits through block mappings: `FieldEdit` gains `SetPath`, `RemovePath` and `RenamePath`, each addressing a field by a `path` of keys (and, for later releases, sequence indices). New `EditErrorCode`s `PathNotFound`, `PathTypeMismatch` and `UnsupportedPath`. A path across a sequence or a flow collection is refused as `UnsupportedPath` for now.
