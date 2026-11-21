---
slug: liveness/in-use
category: liveness
description: How can a cleaner tell the store is in use, so it never deletes data under a running process?
valueSchema:
  type: object
  additionalProperties: false
  properties:
    processes: { type: array, items: { type: string, minLength: 1 } }
    locks: { type: array, items: { type: string, minLength: 1 } }
---

`processes` are the process names of a daemon or the tool itself; `locks` are lock files it holds
while it works. A cleaner refuses a candidate while either is present.
