---
'@osdlc/conformance-suites': patch
---

`registryProblems` now reports a reader listed twice in a family (by `dir` or by `name`) and a reader that is also an implementation of the same family. Before, a copy-pasted entry passed and the library was checked twice.
