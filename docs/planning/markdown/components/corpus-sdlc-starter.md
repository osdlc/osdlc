---
name: "@osdlc/corpus-sdlc-starter"
kind: corpus
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [present, target]
status: unpublished
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/corpora/sdlc-starter
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/corpora/sdlc-starter
tasks:
  - "[78 Bring in profiles](../tasks/78%20Models%20repo%20setup.md)"
  - "[80 Profile publishers](../tasks/80%20Models%20publishers.md)"
  - "[63 Starter corpus](../tasks/63%20Starter%20corpus.md)"
  - "[64 Starter content](../tasks/64%20Starter%20content.md)"
  - "[65 Leak check](../tasks/65%20Leak%20check.md)"
  - "[66 Publish starter](../tasks/66%20Publish%20starter.md)"
  - "[53 Plan on sdlc](../tasks/53%20Plan%20on%20sdlc.md)"
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

A starter corpus of principles and standards that any project can reference and cite. This plan
(task 53) and then a work repo name it under references: with the prefix osdlc, sync it into
_references/osdlc/ and cite its records by id.

## Notes

- Decision D14. It starts with two principles, P-0001 and P-0002, and the owner adds more (task 64).
- Built in osdlc/markdown#19. It came to osdlc/osdlc (decision D19, task 78), at
  packages/corpora/sdlc-starter, with a changeset for its first release, 0.1.0.
- Not published. The owner stages the name and sets its trusted publisher (task 80), and the release
  needs osdlc/osdlc#785.
- dev's own intent records are not the upstream for now.
- A CI check keeps private data out of it (task 65): tools/leak-check.sh, run by
  .github/workflows/profiles.yml.
