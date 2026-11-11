---
name: "@osdlc/corpus-profile-intent"
kind: profile
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: planned
tasks:
  - "[49 SDLC profiles](../tasks/49%20SDLC%20profiles.md)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
dev_depends_new:
  - "[model-schema](model-schema.md)"
  - "[pack-intent](pack-intent.md)"
edge_notes:
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A profile is a corpus that has only types.
  - edge: dev_depends_new
    to: "[model-schema](model-schema.md)"
    note: "Its profile generator writes this profile (task 48)."
  - edge: dev_depends_new
    to: "[pack-intent](pack-intent.md)"
    note: The profile is generated from this pack.
---

The intent pack's kinds as a corpus profile, generated from the pack. A Markdown corpus names it
under extends: and builds its types on these with x-extends.

## Notes

- Planned in decision D13: packs are the model, and corpus-schema is the store spec for Markdown.
- Where it lives and whether it goes to npm are not decided.
