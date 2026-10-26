---
'@osdlc/detect-harness': minor
---

Behaviour change: `detect({ mode: 'project' })` now decides whether a path is inside the project with `@osdlc/path-guard`'s `nodeGuard.contains` (a new runtime dependency), which compares real paths. A path whose text is outside the project but whose real path is inside it (a symbolic link into the project) is now read; before, it answered "absent". A path that does not exist yet under a symbolic link out of the project still answers "absent". The plugin manifest and skill, command and agent readers use the same check for "inside the plugin folder".
