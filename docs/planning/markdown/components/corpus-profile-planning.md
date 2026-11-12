---
name: "@osdlc/corpus-profile-planning"
kind: profile
language: markdown
layer: "[profiles](../layers/profiles.md)"
states: [target]
status: planned
repo_target: "[osdlc/markdown](../repos/osdlc-markdown.md)"
path_target: profiles/planning
tasks:
  - "[38 Planning profile](../tasks/38%20Planning%20profile.md)"
  - "[53 Plan on sdlc](../tasks/53%20Plan%20on%20sdlc.md)"
links:
  - "[osdlc/markdown#14](https://github.com/osdlc/markdown/pull/14)"
implements_new:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
edge_notes:
  - edge: implements_new
    to: "[corpus-schema-spec](corpus-schema-spec.md)"
    note: A profile is a corpus that has only types.
---

Record types for a plan: tasks, milestones and decisions. A corpus names it under extends: and
builds its own types on these with x-extends.

## Notes

- Private package. Not on npm. A corpus extends it by a path to the folder.
- Its types are open, so a corpus can add fields. A corpus that wants a closed type lists the
  profile's fields as well as its own. Task 44 removes that need.
- Task 53 removes this profile: the plan moves to the sdlc profile and profiles/planning is
  deleted. Before 1.0 no second form is kept.
