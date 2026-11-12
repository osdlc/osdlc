---
corpus-schema: 0
level: 2
extends:
  claims: "@osdlc/corpus-profile-claims"
uses: [claims/statements, claims/study-results]
---

# Package fixture

A small corpus that extends the claims profile by its package name. `tests/package.sh` installs
the packed profile beside it and validates it.

- [documents](documents/documents.schema.md) adds a required `publisher` field to the profile's
  type.
- `study-results` and `statements` use the profile's types as they are, through `uses`, with no
  schema files.
