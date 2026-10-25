---
'@osdlc/yaml-splice': minor
---

An `EditError` with no span (including one whose wasm span was malformed) no longer carries a `span` property set to `undefined`; the key is absent, as the type and its `exactOptionalPropertyTypes` contract say.
The bundled wasm carries the yaml-splice crate's fixes: `splice_keys` with a key named twice writes it once (the last edit wins) instead of corrupting the output, a replaced collection in a CRLF block keeps CRLF, and a signed hex or octal scalar (`-0x1F`, `+0o7`) reads as a string, as yaml@2 does. A plain `0x`/`0o` scalar too wide for a 64-bit integer (`0xFFFFFFFFFFFFFFFF`) now reads as a number, as yaml@2 reads it, instead of a string; such a top-level key is therefore no longer addressable as a string key.
