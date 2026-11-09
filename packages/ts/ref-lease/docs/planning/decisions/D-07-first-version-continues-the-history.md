---
id: D-07
type: decision
state: accepted
created: 2026-11-07
---

# D-07: The first public version continues the history

## Decision

The first public release is 0.2.4, the version the code's history reaches when each change since
its first version is replayed under semver. It does not restart at 0.1.0.

- Versions 0.1.0 to 0.2.3 were never published. The CHANGELOG lists them under "History before the
  first public release".
- From the first release on, Changesets sets every version. The manifest starts at 0.2.3, and the
  first release's changeset is a patch, which gives 0.2.4.

## Why

The code had been in use for five months before it was published, with one breaking change and
many fixes. Keeping the version it naturally reached means the number tells the truth about that
history, and the CHANGELOG reads straight from the unpublished versions into the first release,
with no reset in between.
