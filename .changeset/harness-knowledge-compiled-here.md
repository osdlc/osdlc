---
"@osdlc/harness-knowledge": patch
---

The data is now compiled from the harness reference corpus in osdlc/osdlc
(`packages/corpora/harness-reference`), which came from osdlc/skillwright. The values are
unchanged. Each `basis` link, and the `corpus` block, now name osdlc/osdlc and the commit the
corpus was compiled at. `sync` compiles the corpus in this repository in place of downloading an
osdlc/skillwright release, and the README says so.
