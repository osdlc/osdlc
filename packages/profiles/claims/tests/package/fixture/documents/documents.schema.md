---
x-extends: claims/documents
required: [publisher]
properties:
  publisher:
    description: Who published the document.
    type: string
    minLength: 1
---

# Documents

The profile's `documents` type, with a required `publisher`.
