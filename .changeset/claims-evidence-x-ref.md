---
"@osdlc/corpus-profile-claims": minor
---

`hasEvidenceItems` is now `x-ref: study-results`, not a path pattern. An evidence link must point at the record file of a study result, or of a type that extends it under any folder name. A link to another file in a record folder, or out of the corpus, is now an error, not a pass or a warning. The evidence line schema is inlined in `statements`, since `x-ref` does not follow `$ref`. Needs `@osdlc/corpus-schema` 0.6.0 or later.
