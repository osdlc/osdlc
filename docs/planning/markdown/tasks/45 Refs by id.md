---
number: 45
title: Refs by id
detail: bare id or wikilink
status: todo
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
---

`x-ref` by id. Today an `x-ref` field holds a relative Markdown link. It may also hold a bare record
id, or a wikilink such as `[[T-0003]]`. The validator matches it to the record with that id. dev's
planning records link this way. After 9.
