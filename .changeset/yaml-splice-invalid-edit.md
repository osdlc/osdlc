---
"@osdlc/yaml-splice": minor
---

A malformed edit is now refused as the new `EditErrorCode` `InvalidEdit`, and an error that is not a refusal is passed through instead of being reported as `InvalidResult`.

- `InvalidEdit`: a `Set` with no `value` (or `value: undefined`), an unknown tag, or a `Set` value nested more than 124 levels deep (the JSON decoder's recursion limit). These were reported as `InvalidResult`, which says the edit would damage the document, when the edit itself was bad.
- **Breaking:** `editYaml` rethrows any error without a known code unchanged. Before, it wrapped it in `EditError('InvalidResult', …)`. A Rust panic in the WebAssembly module (`RuntimeError: unreachable`) now reaches the caller as a `RuntimeError`, so a crashed module no longer looks like a normal refusal. Code that catches only `EditError` now sees these errors propagate.
