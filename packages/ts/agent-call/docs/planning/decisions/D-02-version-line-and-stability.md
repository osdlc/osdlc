---
id: D-02
type: decision
state: accepted
created: 2026-10-18
---

# D-02: Version line and stability

## Decision

- The package is on the 0.x line. The first published version is `0.4.0`.
  The manifest holds `0.3.0` and the first changeset is a minor bump, so the
  release produces `0.4.0`.
- The stable exports follow semantic versioning for 0.x: a breaking change
  goes in a minor release and is marked `Breaking` in the CHANGELOG.
- Eight exports are experimental (see [D-03](D-03-experimental-exports.md)).
  They may change in any minor release.
- Earlier versions were used during development in `sksizer/dev` and were
  never published. The CHANGELOG keeps that history in its own section.

## Why

- The API had two breaking changes in the 30 days before the release. That
  is too soon for `1.0.0`.
- `0.4.0` is the version the development repository already carried. It is
  above the history rebuilt from git, `0.3.0`.

## Consequences

- Moving to `1.0.0` is a later decision, once the experimental exports have
  settled.
- A new experimental export must carry `@experimental` and be listed in the
  README. A test checks that the two agree.
