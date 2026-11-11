---
number: 72
title: Queries span references
detail: "namespaced types, one result per record"
status: todo
type: functional
milestone: "[m-query](../milestones/m-query.md)"
after:
  - "[15 Query layer](15%20Query%20layer.md)"
  - "[70 References](70%20References.md)"
---

Search and queries over typed records span referenced corpora. A query names a referenced type by
its namespace path, such as `osdlc/principles`, or `b/c/principles` for a reference of a reference.
Each result carries the record's identity, its package, type and id, and the package version. One
record reached by two paths is one result. [#12](https://github.com/osdlc/markdown/pull/12) is
defining the namespace and identity rules now, and this task follows them. The owner wants it soon.
After 15 and 70.
