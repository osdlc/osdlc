---
number: 72
title: Queries span references
detail: "namespaced types, one result per record"
status: done
type: functional
milestone: "[m-query](../milestones/m-query.md)"
after:
  - "[15 Query layer](15%20Query%20layer.md)"
  - "[70 References](70%20References.md)"
prs:
  - "[osdlc/osdlc#806](https://github.com/osdlc/osdlc/pull/806)"
---

Search and queries over typed records span referenced corpora. A query names a referenced type by
its namespace path, such as `osdlc/principles`, or `b/c/principles` for a reference of a reference.
Each result carries the record's identity: its Package URL, from the package, the version, the
type and the id, such as `pkg:npm/%40osdlc/corpus-sdlc-starter@0.1.0#principles/P-0002` (decision
D16). One record reached by two paths is one result, since a graph holds one version of each
corpus. [#12](https://github.com/osdlc/markdown/pull/12) is defining the
namespace rules now, and this task follows them. The owner wants it soon.
After 15 and 70.

Done: `@osdlc/corpus-query` ([#806](https://github.com/osdlc/osdlc/pull/806)) queries across referenced corpora, names a type by its namespace path and gives each record its identity. Its first release waits on the Version Packages pull request.
