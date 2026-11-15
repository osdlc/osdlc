---
name: the evidence project
kind: app
language: none
layer: "[apps](../layers/apps.md)"
states: [present, target]
status: unpublished
tasks:
  - "[5 Project writes](../tasks/5%20Project%20writes.md)"
  - "[23 Claims profile](../tasks/23%20Claims%20profile.md)"
depends_new:
  - "[corpus-schema-ts](corpus-schema-ts.md)"
extends_new:
  - "[corpus-profile-claims](corpus-profile-claims.md)"
edge_notes:
  - edge: depends_new
    to: "[corpus-schema-ts](corpus-schema-ts.md)"
    note: "Task 5: its records are checked by the validator."
  - edge: extends_new
    to: "[corpus-profile-claims](corpus-profile-claims.md)"
    note: Task 23 switches it from copies to the profile.
---

Another project that will keep evidence, observations and test material (scripts, queries, CSV
results) as records with their files.

## Notes

- The plan and architecture do not name it or its repo.
- Task 5: it copies the types from the claims example and writes records, after tasks 3, 4 and 22.
  Task 23 switches it to the claims profile.
