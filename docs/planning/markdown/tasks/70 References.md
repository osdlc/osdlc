---
number: 70
title: References
detail: "references, _references/"
status: doing
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[27 Org corpora](27%20Org%20corpora.md)"
  - "[29 Sync](29%20Sync.md)"
prs:
  - "[osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12)"
---

`references` in the root file, as decision D15 says. It maps a prefix to another corpus, by package
name or path, whose records a corpus links to and cites by id. `extends` brings types only.
`corpus-schema sync` copies each referenced corpus into `_references/<prefix>/`, which replaces
`_inherited/`, and `validate` fails when the copy differs from the installed package. It works at
any level, so a plain vault with no types can reference a corpus. Nested references get a
namespace path, such as `b/c/principles`. An `x-ref` to a type also matches records of that type, or
of a type that extends it, in every referenced corpus. So a profile's field with `x-ref:
sdlc/principles` resolves `P-0002` in the starter, whose principles build on the profile's. After 27 and 29, whose record inheritance and copy it
reshapes. In progress in [#12](https://github.com/osdlc/markdown/pull/12), which also defines the
namespace and identity rules.
