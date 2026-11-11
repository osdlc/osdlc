---
name: "sdlc (@sdlc/cli)"
kind: app
language: ts
layer: "[apps](../layers/apps.md)"
states: [present, target]
status: unpublished
repo_present: "[sksizer/dev](../repos/sksizer-dev.md)"
path_present: solutions/ontological
repo_target: "[sksizer/dev](../repos/sksizer-dev.md)"
path_target: solutions/ontological
tasks:
  - "[50 Dev on sdlc](../tasks/50%20Dev%20on%20sdlc.md)"
links:
  - "[sksizer/dev#4070](https://github.com/sksizer/dev/pull/4070)"
depends:
  - "[etag-write](etag-write.md)"
  - "[frontmatter-lossless](frontmatter-lossless.md)"
  - "[gfm-table](gfm-table.md)"
  - "[path-guard](path-guard.md)"
  - "[yaml-splice](yaml-splice.md)"
  - "[markdown-contract-vendored](markdown-contract-vendored.md)"
  - "[markdown-ui](markdown-ui.md)"
  - "[markdown-editor](markdown-editor.md)"
  - "[markdown-render](markdown-render.md)"
depends_new:
  - "[markdown-link](markdown-link.md)"
  - "[pack-sdlc](pack-sdlc.md)"
depends_going:
  - "[markdown-link-dev-copy](markdown-link-dev-copy.md)"
edge_notes:
  - edge: depends_new
    to: "[markdown-link](markdown-link.md)"
    note: The private copy goes away in the target. The plan does not name sdlc among its users.
  - edge: depends
    to: "[markdown-ui](markdown-ui.md)"
    note: Through the desktop app in solutions/ontological/desktop.
  - edge: depends
    to: "[markdown-editor](markdown-editor.md)"
    note: Through the desktop app in solutions/ontological/desktop.
  - edge: depends
    to: "[markdown-render](markdown-render.md)"
    note: Through the desktop app in solutions/ontological/desktop.
  - edge: depends_new
    to: "[pack-sdlc](pack-sdlc.md)"
    note: "The plan's target diagram says sdlc takes its types from profiles."
---

The planning CLI and plugin. It keeps its planning docs as a corpus of notes with typed frontmatter.

## Notes

- Uses osdlc note parts from npm, dev's private markdown-link copy, and the vendored
  markdown-contract 0.2.1. Its desktop app (solutions/ontological/desktop) uses the render and edit
  packages.
- Target from the plan's diagram: it takes its types from profiles. Open sksizer/dev#4070 says sdlc
  does not use the packs yet.
- Plan: nothing from dev is published.
