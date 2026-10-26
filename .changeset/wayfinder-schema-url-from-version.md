---
'@osdlc/wayfinder': patch
---

The `$schema` URL that `way config set` writes, and the `$id` of the shipped `schema/config.json`, now follow the package version's `major.minor`, so they name `@osdlc/wayfinder@0.11` in this release line. They had stayed at `0.10`. `CONFIG_SCHEMA_URL` is now typed `string` instead of a string literal.
