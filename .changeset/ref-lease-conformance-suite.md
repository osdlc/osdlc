---
'@osdlc/ref-lease': patch
---

The protocol's conformance cases move from `tests/conformance/*.json` to the shared suite `packages/conformance/ref-lease/suite.json`, and the new `ref-lease` Rust crate runs them too. No change to the package's behaviour or API.
