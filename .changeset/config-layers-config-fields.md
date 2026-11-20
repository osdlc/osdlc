---
'@osdlc/config-layers': minor
---

Per-leaf field metadata and a field walker. `configFields(shape)` lists every leaf of a config schema as a `ConfigField` (path, label, description, help, control, hidden, secret, optional, default, choices), so a tool can render its example file, `config list` or a settings screen from one schema. Any field, nested ones included, may now carry `label`, `help`, `control` and `hidden` in `.meta()` (`FieldMeta`); a top-level key's meta accepts them too. New exports: `configFields`, `defaultControl`, `ConfigField`, `FieldMeta`.
