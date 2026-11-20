---
"@osdlc/harness-knowledge": minor
---

`loadKnowledge` imports the compiled data as a JSON module, so a program that bundles the package
no longer fails at startup looking for `../data/harness-knowledge.json` beside the bundle. The data
is compiled from the corpus when the package is built instead of being committed; the published
package is unchanged. `DATA_DIR` is deprecated and nothing reads it.
