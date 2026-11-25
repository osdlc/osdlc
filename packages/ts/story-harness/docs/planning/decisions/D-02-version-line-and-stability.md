---
id: D-02
type: decision
state: accepted
created: 2026-11-07
---

# D-02: Version line and stability

## Decision

- The first published version is `0.5.0`. `0.4.0` was prepared as the first
  release (owner's choice, 2026-11-10) but never published: the accessibility
  check and the keyboard walk landed before the first publish, and the
  release took the next minor. The history before the move reaches 0.3.4, and
  none of it was public.
- The line stays 0.x. A minor version may break the API, and its changelog
  says what to change.
- `openPerfStory`, `noLongTasks`, `paintedAt`, `responseEnd`, `walkPage`, the
  `Walk*` types and every export of `./parley-capture` are experimental and
  carry `@experimental`; every other export is stable within a minor
  version.

## Why

- The package is six weeks old, and its last breaking change is two weeks
  old. 1.0 waits for 90 days with no breaking change.
- The experimental exports are the newest, and `paintedAt` may gain a
  timeout.

## Consequences

- A test checks that the README's experimental list matches the tags.
