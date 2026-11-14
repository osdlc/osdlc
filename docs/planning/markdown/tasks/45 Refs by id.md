---
number: 45
title: Refs by id
detail: bare id or wikilink
status: done
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[9 Extends](9%20Extends.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
  - "[osdlc/osdlc#790](https://github.com/osdlc/osdlc/pull/790)"
---

`x-ref` by id. Today an `x-ref` field holds a relative Markdown link. It may also hold a bare record
id, or a wikilink such as `[[T-0003]]`. The validator matches it to the record with that id. dev's
planning records link this way. After 9. Built in [#12](https://github.com/osdlc/markdown/pull/12)
as `x-ref-form: id` and `x-ref-form: wikilink`. An id resolves in the corpus and in the corpora it
draws on, so a work repo's task can cite the starter's principle as `P-0002`. The `x-ref` names a
type, not the id. Under decision D15, records come from referenced corpora, and task 70 lets an
`x-ref` to a type such as `sdlc/principles` match the records of that type in them.

Done: `x-ref-form: id` and `wikilink` is in `@osdlc/corpus-schema` 0.4.0, on npm since 2026-11-13 (task 36).
