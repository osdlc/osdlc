---
"@osdlc/corpus-profile-claims": minor
---

The first release of `@osdlc/corpus-profile-claims`: the claims profile for corpus-schema, as a
corpus of types and no records. It holds the record types for claims and the evidence behind them
(documents, methods, study results, statements), after GA4GH VA-Spec. A corpus names the package
under `extends` in its root file, and the validator finds the types through the package's
`"corpus"` field. It needs `@osdlc/corpus-schema` 0.3.0 or later. Licence `MIT OR Apache-2.0`.
