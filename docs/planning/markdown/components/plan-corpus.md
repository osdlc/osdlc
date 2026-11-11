---
name: the ecosystem plan corpus
kind: corpus
language: markdown
layer: "[apps](../layers/apps.md)"
states: [target]
status: in-progress
repo_target: "[osdlc/markdown](../repos/osdlc-markdown.md)"
path_target: docs/planning
tasks:
  - "[38 Planning profile](../tasks/38%20Planning%20profile.md)"
  - "[44 Flatten extends](../tasks/44%20Flatten%20extends.md)"
  - "[53 Plan on sdlc](../tasks/53%20Plan%20on%20sdlc.md)"
links:
  - "[osdlc/markdown#13](https://github.com/osdlc/markdown/pull/13)"
  - "[osdlc/markdown#14](https://github.com/osdlc/markdown/pull/14)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
extends_new:
  - "[corpus-profile-sdlc](corpus-profile-sdlc.md)"
dev_depends_new:
  - "[corpus-schema-ts](corpus-schema-ts.md)"
edge_notes:
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A valid level-2 corpus.
  - edge: extends_new
    to: "[corpus-profile-sdlc](corpus-profile-sdlc.md)"
    note: "Task 53. Until then it extends the planning profile."
  - edge: dev_depends_new
    to: "[corpus-schema-ts](corpus-schema-ts.md)"
    note: CI checks it with this repo's corpus-schema, which knows extends.
---

This plan's tasks, milestones and decisions, and the components it changes, kept as records. The
explorer's data is built from it.

## Notes

- Today it extends the planning profile. Its tasks and milestones add fields, and its decisions use
  the profile's type as it is. Task 53 moves it to the sdlc profile.
- Its components, layers, repos, overlaps and datasets are its own types. They describe this
  ecosystem, so they stay out of the profile.
