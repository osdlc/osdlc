---
'@osdlc/conformance-suites': minor
---

Check for same-name pairs: a name in both the Rust and TypeScript library roots must be a registered family, in `unmigrated`, or exempt through the new `notFamilies` (a binding) or `noSuiteYet` (a pair with no shared cases yet) config.json keys. An exemption for a registered family is stale and fails. Exports `unlistedPairs`.
