---
id: D-02
type: decision
state: accepted
created: 2026-11-07
---

# D-02: Version line and stability

## Decision

- The first published version is `0.4.0` (owner's choice, 2026-11-10). The
  history before the move reaches 0.3.4, and the changes made to get ready for
  the first release include breaking ones, so it takes a minor bump, as
  repo-cleaner's first release did. No earlier version was public.
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
