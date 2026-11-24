# @osdlc/corpus-profile-claims

## 0.2.0

### Minor Changes

- fb0034a: `hasEvidenceItems` is now `x-ref: study-results`, not a path pattern. An evidence link must point at the record file of a study result, or of a type that extends it under any folder name. A link to another file in a record folder, or out of the corpus, is now an error, not a pass or a warning. The evidence line schema is inlined in `statements`, since `x-ref` does not follow `$ref`. Needs `@osdlc/corpus-schema` 0.6.0 or later.

## 0.1.0

### Minor Changes

- e54b989: The first release of `@osdlc/corpus-profile-claims`: the claims profile for corpus-schema, as a
  corpus of types and no records. It holds the record types for claims and the evidence behind them
  (documents, methods, study results, statements), after GA4GH VA-Spec. A corpus names the package
  under `extends` in its root file, and the validator finds the types through the package's
  `"corpus"` field. It needs `@osdlc/corpus-schema` 0.3.0 or later. Licence `MIT OR Apache-2.0`.
