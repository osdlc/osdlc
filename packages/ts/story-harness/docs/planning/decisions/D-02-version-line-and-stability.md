---
id: D-02
type: decision
state: proposed
created: 2026-11-07
---

# D-02: Version line and stability

## Decision

- The first published version is `0.3.5`, the version the history reaches
  when every change up to the move is counted under semver. The changes made
  to get ready for the first release, breaking ones included, belong to that
  version and cost no bump, because no version with the old API was public.
- The line stays 0.x. A minor version may break the API, and its changelog
  says what to change.
- `openPerfStory`, `noLongTasks`, `paintedAt` and `responseEnd` are
  experimental and carry `@experimental`; every other export is stable within
  a minor version.

## Why

- The package is six weeks old, and its last breaking change is two weeks
  old. 1.0 waits for 90 days with no breaking change.
- The experimental helpers are the newest, and `paintedAt` may gain a
  timeout.

## Consequences

- A test checks that the README's experimental list matches the tags.
