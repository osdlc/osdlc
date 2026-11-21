---
"@osdlc/corpus-schema": minor
---

new: a `corpus-schema new [--folder] [--json <data>] <corpus> <type> <id>` verb that writes a record skeleton from its type's schema: every required field, with `const` and `default` values, a `<a | b>` placeholder for each `enum`, and required objects built out, across `x-extends` and `uses`. It checks the id against the id rules and `x-id-pattern`, and refuses a taken one. With `--json` the fields fill the skeleton and the record is validated before it is written. The library exports `recordSkeleton(root, type)` and `newRecord(root, type, id, options)`.
