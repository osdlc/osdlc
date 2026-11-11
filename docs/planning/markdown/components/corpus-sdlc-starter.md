---
name: "@osdlc/corpus-sdlc-starter"
kind: corpus
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: planned
repo_target: "[osdlc/markdown](../repos/osdlc-markdown.md)"
path_target: corpora/starter
tasks:
  - "[59 Trusted publishing](../tasks/59%20Trusted%20publishing.md)"
  - "[63 Starter corpus](../tasks/63%20Starter%20corpus.md)"
  - "[64 Starter content](../tasks/64%20Starter%20content.md)"
  - "[65 Leak check](../tasks/65%20Leak%20check.md)"
  - "[66 Publish starter](../tasks/66%20Publish%20starter.md)"
  - "[67 Work example](../tasks/67%20Work%20example.md)"
  - "[68 Work cites starter](../tasks/68%20Work%20cites%20starter.md)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
extends_new:
  - "[corpus-profile-sdlc](corpus-profile-sdlc.md)"
edge_notes:
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A corpus with records, published as an npm package.
  - edge: extends_new
    to: "[corpus-profile-sdlc](corpus-profile-sdlc.md)"
    note: By package name. Its records are the profile's principles and standards.
---

A starter corpus of principles and standards that any project can inherit. A work repo names it
under references: with the prefix osdlc, syncs it into _references/osdlc/ and cites its records by
id.

## Notes

- Decision D14. It starts with two principles, P-0001 and P-0002, and the owner adds more (task 64).
- dev's own intent records are not the upstream for now.
- A CI check keeps private data out of it (task 65).
