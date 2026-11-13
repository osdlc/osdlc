---
"@osdlc/harness-knowledge": patch
---

The README says where the data now comes from: the harness reference corpus in osdlc/osdlc
(`packages/corpora/harness-reference`), which came from osdlc/skillwright. The data is unchanged,
and its `basis` links still name the osdlc/skillwright commit it was compiled at. `sync` compiles
the corpus in this repository in place of downloading an osdlc/skillwright release.
