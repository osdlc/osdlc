---
id: D-W3CV
type: decision
state: accepted
created: 2026-11-22
---

# D-W3CV: The package map reads manifests through `@osdlc/system-model`

## Decision

- `describeChange` finds the packages a change touches, and their dependencies, with
  `walkManifests` and `buildDependencyGraph` from `@osdlc/system-model/build`. It picks the
  manifest files out of a git tree with that module's `MANIFEST_FILES`, so the two lists cannot
  differ.
- The package depends on `@osdlc/system-model` with a `workspace:^` range. The import is dynamic,
  so a caller that never describes a change does not load it.

## Why

- `@osdlc/system-model` is the one place that knows which files name a package, and it is public.
  Reading manifests here too would be a second list that could drift.
- `walkManifests` reads a folder, not a git tree. For a commit's manifests, `describeChange`
  writes them to a scratch folder at their paths and walks that.

## Consequences

- `describe` reads two manifest kinds today, `package.json` and `Cargo.toml`. A new kind in
  `@osdlc/system-model` reaches `describe` with the next release of it.
