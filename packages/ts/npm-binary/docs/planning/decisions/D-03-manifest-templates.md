---
id: D-03
type: decision
state: accepted
created: 2026-11-07
---

# D-03: Templates fix key order; the arguments fix identity

## Decision

- `platformManifest` and `launcherManifest` take an optional `template`. Its
  fields keep their position. The fields the library sets that the template
  does not name are appended.
- `name`, `version` and `description` always come from the arguments. A
  template that names one of them fixes only its position.
- The library always sets the fields the layout depends on: `os`, `cpu` and
  `preferUnplugged` on a platform package; `bin` and `optionalDependencies`
  on the launcher. `files` and the launcher's `engines` are defaults the
  template may replace.
- The template object is not changed.

## Why

- A product that already publishes wants the same bytes in each
  `package.json` release after release, so diffs between versions stay
  readable. Key order is the product's choice, made once in its template.
- A template is often a checked-in file. A stale `version` or `name` left in
  it must not change what is published, so the explicit arguments win.
