---
'@osdlc/conformance-suites': minor
---

A family in `families.json` may list `readers`: libraries whose tests read the suite but that are not twins of the reference. They are checked for language, folder and a test that names the suite, but not for a matching version, and a library that reads a suite may be listed as an implementation or as a reader.
