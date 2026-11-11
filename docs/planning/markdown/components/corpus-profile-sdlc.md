---
name: "@osdlc/corpus-profile-sdlc"
kind: profile
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: planned
tasks:
  - "[49 SDLC profiles](../tasks/49%20SDLC%20profiles.md)"
  - "[50 Dev on sdlc](../tasks/50%20Dev%20on%20sdlc.md)"
  - "[51 Work copy](../tasks/51%20Work%20copy.md)"
  - "[52 Work extends](../tasks/52%20Work%20extends.md)"
  - "[53 Plan on sdlc](../tasks/53%20Plan%20on%20sdlc.md)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
extends_new:
  - "[corpus-profile-intent](corpus-profile-intent.md)"
dev_depends_new:
  - "[model-schema](model-schema.md)"
  - "[pack-sdlc](pack-sdlc.md)"
edge_notes:
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A profile is a corpus that has only types.
  - edge: extends_new
    to: "[corpus-profile-intent](corpus-profile-intent.md)"
    note: "The sdlc pack's requires: becomes extends:."
  - edge: dev_depends_new
    to: "[model-schema](model-schema.md)"
    note: "Its profile generator writes this profile (task 48)."
  - edge: dev_depends_new
    to: "[pack-sdlc](pack-sdlc.md)"
    note: The profile is generated from this pack.
---

The sdlc pack's kinds as a corpus profile, generated from the pack. sdlc corpora in dev, at work
and in this plan validate against it.

## Notes

- Planned in decision D13. It extends the intent profile.
- A work repo uses a flattened copy with corpus-schema 0.2.0 first (task 51), then extends: after
  0.3.0 (task 52).
- Where it lives and whether it goes to npm are not decided.
