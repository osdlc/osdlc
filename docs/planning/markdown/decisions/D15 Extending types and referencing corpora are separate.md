---
title: Extending types and referencing corpora are separate
status: decided
decided: "2026-11-11"
---

Extending types and referencing corpora are separate. A corpus's root file has three keys for
other corpora:

- `extends` brings types only. A local type builds on a parent's type with `x-extends`.
- `uses: [sdlc/*]` takes a parent's types as they are. It replaces the one-line schema files that
  held only `x-extends`.
- `references` brings another corpus's records, to link to and cite by id. `corpus-schema sync`
  copies each referenced corpus into `_references/<prefix>/`, which replaces `_inherited/`.
  `references` works at any level, so a plain vault with no types can reference a corpus.

Other systems keep the two apart too. DITA marks a link to another deliverable with
`scope="peer"` and resolves it through keys
([cross-deliverable linking](https://docs.oasis-open.org/dita/dita/v1.3/errata02/os/complete/part3-all-inclusive/archSpec/base/links-between-maps.html),
[keys](https://docs.oasis-open.org/dita/dita/v1.3/errata02/os/complete/part3-all-inclusive/archSpec/base/key-based-addressing.html)).
Sphinx links to other projects' objects with
[intersphinx](https://www.sphinx-doc.org/en/master/usage/extensions/intersphinx.html). Antora
links across components with [`xref`](https://docs.antora.org/antora/latest/page/xref/). Hugo
brings other modules' files in with [mounts](https://gohugo.io/configuration/module/). OWL's
[`owl:imports`](https://www.w3.org/TR/owl2-syntax/#Imports) is the merge we split: it brings a
whole ontology in, its axioms and its individuals together.

The terms:

- `references` says what a corpus does with the other one. `peers`, DITA's term, is obscure, and
  `mounts` names the mechanism, not the relation.
- `extends` is the standard term for building on a type.
- `uses` covers taking types as they are.

Transclusion, such as DITA's
[`conref`](https://docs.oasis-open.org/dita/dita/v1.3/errata02/os/complete/part3-all-inclusive/archSpec/base/conref.html)
or AsciiDoc's [`include`](https://docs.asciidoctor.org/asciidoc/latest/directives/include/), is out
of scope. It is a body concern, for markdown-contract later.

This changes two decisions. [D11](D11%20Upstream%20corpora%20travel%20as%20npm%20packages.md) still
holds: both extended and referenced corpora travel as npm packages. In
[D12](D12%20Inherited%20records%20come%20in%20as%20a%20committed%20copy.md), records no longer come
in through `extends`. They come through `references`, and the copy is `_references/<prefix>/`.
