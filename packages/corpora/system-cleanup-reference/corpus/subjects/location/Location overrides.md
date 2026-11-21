---
slug: location/override
category: location
description: Which environment variables or settings move the store's data somewhere else?
valueSchema:
  type: object
  additionalProperties: false
  properties:
    vars: { type: array, items: { type: string, minLength: 1 } }
    settings: { type: array, items: { type: string, minLength: 1 } }
---

A cleaner reads these before the defaults in [Data directories](Data%20directories.md), so it
cleans where the data really is. `vars` are environment variables; `settings` are config keys,
written as the tool names them.
