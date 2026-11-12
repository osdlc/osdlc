---
title: The first upstream instance is a starter corpus
status: decided
decided: "2026-11-11"
---

The first upstream corpus with records is a starter corpus, `@osdlc/corpus-sdlc-starter`, in
osdlc/markdown at `corpora/sdlc-starter/`. It uses the sdlc profile's types and holds principles and
standards that any project can reference and cite. A work repo names it under `references` with the
prefix `osdlc`, syncs it into `_references/osdlc/` and cites its records by id (decision D15).

dev's own intent records are not the upstream for now. dev is private, and its records cite much
that is only true in dev. The starter starts small, with two principles, and the owner adds to it.
A CI check keeps private data out of it, since it ships to a public registry.

It moves to osdlc/models with the profiles, per [D17](D17%20Profiles%20and%20corpora%20live%20in%20osdlc%20models.md).
