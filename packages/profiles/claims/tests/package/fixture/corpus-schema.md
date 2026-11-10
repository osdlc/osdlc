---
corpus-schema: 0
level: 2
extends:
  claims: "@osdlc/corpus-profile-claims"
---

# Package fixture

A small corpus that extends the claims profile by its package name. `tests/package.sh` installs
the packed profile beside it and validates it.

- [documents](documents/documents.schema.md) adds a required `publisher` field to the profile's
  type.
- [study-results](study-results/study-results.schema.md) and
  [statements](statements/statements.schema.md) use the profile's types as they are.
