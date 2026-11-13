---
"@osdlc/corpus-profile-sdlc": minor
---

The first release of `@osdlc/corpus-profile-sdlc`: the sdlc profile for corpus-schema, as a corpus
of types and no records. It holds the fourteen planning record types of sdlc, from principles and
decisions to tasks, milestones and notes. The types are generated from `@osdlc/pack-intent` and
`@osdlc/pack-sdlc` by model-schema's corpus emitter. A corpus names the package under `extends` in
its root file and takes its types through `uses: [sdlc/*]`, and the validator finds the types
through the package's `"corpus"` field. A record's id is cut from its file name, so
`P-0002-a-slug.md` has the id `P-0002`, and a decision may be a folder holding `README.md`. It
needs `@osdlc/corpus-schema` 0.3.0 or later. Licence `MIT OR Apache-2.0`.
