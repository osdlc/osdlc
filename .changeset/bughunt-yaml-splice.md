---
'@osdlc/yaml-splice': patch
---

An `EditError` with no span (including one whose wasm span was malformed) no longer carries a `span` property set to `undefined`; the key is absent, as the type and its `exactOptionalPropertyTypes` contract say.
