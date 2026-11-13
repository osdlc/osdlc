---
number: 36
title: Release 0.3.0
detail: corpus-schema
status: owner
type: supporting
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
  - "[21 Release here](21%20Release%20here.md)"
  - "[27 Org corpora](27%20Org%20corpora.md)"
  - "[29 Sync](29%20Sync.md)"
  - "[43 Strict mode](43%20Strict%20mode.md)"
  - "[44 Flatten extends](44%20Flatten%20extends.md)"
  - "[45 Refs by id](45%20Refs%20by%20id.md)"
  - "[46 Multi-type x-ref](46%20Multi-type%20x-ref.md)"
  - "[59 Corpus-schema publisher](59%20Corpus-schema%20publisher.md)"
  - "[70 References](70%20References.md)"
  - "[71 Uses](71%20Uses.md)"
  - "[73 Identity and record files](73%20Identity%20and%20record%20files.md)"
---

Release corpus-schema 0.3.0. (supporting) The first version with `extends`, `x-extends`,
cross-corpus `x-ref` and `sync`, published from osdlc/osdlc. It also carries
`--strict`, flattened `x-extends`, refs by id and `x-ref` to several types, which the sdlc profile
needs. It also carries `references` and `uses` (tasks 70
and 71, decision D15), and identity, the id cut, `x-record-file` and narrative folders (task 73,
decision D16). After 9, 21, 27, 29, 43 to 46, 59, 70, 71 and 73. The changeset is in
[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12), which
[osdlc/osdlc#790](https://github.com/osdlc/osdlc/pull/790) brings to osdlc/osdlc as one commit
([D19](../decisions/D19%20Profiles%20and%20corpora%20come%20to%20osdlc%20osdlc.md)). Owner work: merging #790 and then the Version Packages pull request publishes it.
