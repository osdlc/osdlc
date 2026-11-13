---
name: work example corpus
kind: corpus
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: planned
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
tasks:
  - "[67 Work example](../tasks/67%20Work%20example.md)"
  - "[79 Markdown after the move](../tasks/79%20Markdown%20after%20the%20move.md)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
extends_new:
  - "[corpus-profile-sdlc](corpus-profile-sdlc.md)"
reads_new:
  - "[corpus-sdlc-starter](corpus-sdlc-starter.md)"
edge_notes:
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A valid level-2 corpus.
  - edge: extends_new
    to: "[corpus-profile-sdlc](corpus-profile-sdlc.md)"
    note: "As sdlc, by package name through a file: dependency, with uses: [sdlc/*]."
  - edge: reads_new
    to: "[corpus-sdlc-starter](corpus-sdlc-starter.md)"
    note: "Under references: as osdlc (D15), through a file: dependency."
---

The beeline's end state as an example: a project corpus shaped like a work repo's docs/planning. It
extends the sdlc profile, references the starter corpus, and its task cites P-0002 by id. CI syncs and
validates it with --strict.

## Notes

- It would live in osdlc/osdlc (decision D19). Its place there is not decided.
- Task 53 covers it: this plan's own corpus shows the end state in CI, from npm. It is not built.
