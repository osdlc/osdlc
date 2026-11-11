---
number: 45
title: Refs by id
detail: bare id or wikilink
status: doing
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
---

`x-ref` by id. Today an `x-ref` field holds a relative Markdown link. It may also hold a bare record
id, or a wikilink such as `[[T-0003]]`. The validator matches it to the record with that id. dev's
planning records link this way. After 9. Built in [#12](https://github.com/osdlc/markdown/pull/12)
as `x-ref-form: id` and `x-ref-form: wikilink`. An id resolves in the corpus and in every corpus it
extends, so a work repo's task can cite an inherited principle as `P-0002`, with `x-ref:
osdlc/principles`. The `x-ref` names the parent by prefix, not the id. An `id` value needs no
`_inherited/` copy; a `wikilink` value does, so that Obsidian can open it.
