---
x-extends: claims/statements
properties:
  follows:
    description: A link to the org principle the statement serves, when there is one.
    type: string
    x-ref: org/principles
---

# Statements

The claims profile's `statements` type, with one more field. `follows` links to an org principle
through `_references/org/`.
