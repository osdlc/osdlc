---
title: The first upstream instance is a starter corpus
status: decided
decided: "2026-11-11"
---

The first upstream corpus with records is a starter corpus, `@osdlc/corpus-sdlc-starter`, in
osdlc/markdown at `corpora/starter/`. It extends the sdlc profile and holds principles and
standards that any project can inherit. A work repo names it under `references` with the
prefix `osdlc`, syncs it into `_references/osdlc/` and cites its records by id (decision D15).

dev's own intent records are not the upstream for now. dev is private, and its records cite much
that is only true in dev. The starter starts small, with two principles, and the owner adds to it.
A CI check keeps private data out of it, since it ships to a public registry.
