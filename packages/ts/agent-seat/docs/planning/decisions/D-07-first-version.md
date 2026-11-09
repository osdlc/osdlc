---
id: D-07
type: decision
state: accepted
created: 2026-11-07
---

# D-07: First public version is 0.7.1

## Decision

- The first published version is 0.7.1.
- The versions before it were never published. The CHANGELOG lists them as history, rebuilt from
  the git history: a breaking change bumps the minor version, any other change the patch.

## Why

The code had 28 releasable changes before its first release, six of them breaking. 0.7.1 is the
version those changes add up to, so a reader of the history sees the same numbers the code went
through. The version stays 0.x: the last breaking change is weeks old, and the API changed again
for this release.
