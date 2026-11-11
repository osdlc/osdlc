---
name: work example corpus
kind: corpus
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: planned
repo_target: "[osdlc/markdown](../repos/osdlc-markdown.md)"
path_target: examples/work
tasks:
  - "[67 Work example](../tasks/67%20Work%20example.md)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
extends_new:
  - "[corpus-profile-sdlc](corpus-profile-sdlc.md)"
  - "[corpus-sdlc-starter](corpus-sdlc-starter.md)"
edge_notes:
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A valid level-2 corpus.
  - edge: extends_new
    to: "[corpus-profile-sdlc](corpus-profile-sdlc.md)"
    note: "As sdlc, by package name through a file: dependency."
  - edge: extends_new
    to: "[corpus-sdlc-starter](corpus-sdlc-starter.md)"
    note: "As osdlc, by package name through a file: dependency."
---

The beeline's end state as an example: a project corpus shaped like a work repo's docs/planning. It
extends the sdlc profile and the starter corpus, and its task cites P-0002 by id. CI syncs and
validates it with --strict.

## Notes

- It reuses the example pair's harness (task 35), with a case where a stale copy must fail.
