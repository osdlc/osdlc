---
corpus-schema: 0
level: 2
extends:
  claims: "@osdlc/corpus-profile-claims"
---

# System cleanup profile

Record types for a cited record of where tools and apps keep data that can be reclaimed from
disk. It holds types and no records. The types build on the
[claims profile](https://github.com/osdlc/osdlc/tree/main/packages/profiles/claims):

- [Stores](stores/stores.schema.md): a tool or app that fills a disk, such as a package manager,
  a toolchain manager, a model runtime or an editor.
- [Subjects](subjects/subjects.schema.md): a question asked of every store, with the shape of its
  answer.
- [Statements](statements/statements.schema.md): the claims statement, plus the store, subject,
  scope and status it answers for.
- [Study results](study-results/study-results.schema.md): the claims study result, plus the store,
  the kind of source, the date we looked and the quoted words.
- [Documents](documents/documents.schema.md) and [methods](methods/methods.schema.md): the claims
  types as they are.
