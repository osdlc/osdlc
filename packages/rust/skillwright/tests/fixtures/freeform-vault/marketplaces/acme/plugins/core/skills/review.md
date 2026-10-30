---
name: review
description: Reviews a diff.
sw-targets: [claude]
license: MIT
sw-arguments:
  - name: pr-number
    description: The pull request to review.
    required: true
  - name: depth
    description: How much context to pull in.
    values: [quick, thorough]
    default: quick
---

Narrowed to one destination, and carrying a foreign key the model does not own.
