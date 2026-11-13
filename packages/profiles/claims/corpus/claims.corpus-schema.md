---
corpus-schema: 0
level: 2
---

# The claims profile

Record types for claims and the evidence behind them. This corpus holds types and no records. A
corpus uses them by naming this profile under `extends` in its root file, with the prefix `claims`:

```yaml
extends:
  claims: "@osdlc/corpus-profile-claims"
```

A local type then builds on one of these types with `x-extends`, such as
`x-extends: claims/statements`.

There are four types:

- [documents](documents/documents.schema.md): a source, such as a web page, a README or a paper.
- [methods](methods/methods.schema.md): the steps followed to get a result.
- [study-results](study-results/study-results.schema.md): one observation, what a document said
  or what a run found.
- [statements](statements/statements.schema.md): a claim, its evidence lines, and the verdict.

The types follow GA4GH's Variant Annotation Specification (VA-Spec). The package README says which
of its classes and fields each type takes, and where the types depart from it.
