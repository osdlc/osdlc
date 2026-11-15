---
title: The model layer sits above store specs
status: decided
decided: "2026-11-11"
---

The model layer sits above store specs. Packs, from `@osdlc/model-schema`
([sksizer/dev#4069](https://github.com/sksizer/dev/pull/4069)), are the model. A pack declares
kinds, relations and their inverses, rules and defaults. It says nothing about storage.

A binding maps each kind to a store. Today the only binding is `document:`, which means Markdown.
This is a different binding from the one in the architecture, which means a package built for
another runtime.

corpus-schema is the store spec for Markdown corpora. It stays usable on its own, with no packs.

So each feature has one home:

- corpus-schema: flattened `x-extends`, refs by id and by wikilink, `x-ref` to several types, and
  later `x-body`.
- The model: named relations and inverses, augment with namespaced keys, and rules and defaults.

Body rules come from markdown-contract. The corpus-schema `x-body` keyword points at a contract. It
does not invent its own format.

We don't build another store, or a general binding layer, until a second store is needed.

The intent and sdlc packs generate one profile for now, `@osdlc/corpus-profile-sdlc`, with both
packs' kinds. A separate intent profile splits out later, if a consumer needs the intent kinds
alone. The profile lives in osdlc/osdlc, because it is shared now and dev is private (decision
D19). Its place there is not decided. The generator stays in dev, with model-schema and the packs.
