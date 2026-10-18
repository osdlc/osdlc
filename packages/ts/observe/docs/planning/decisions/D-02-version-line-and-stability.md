---
id: D-02
type: decision
state: accepted
created: 2026-10-18
---

# D-02: Version line and stability

## Decision

- The package is on the 0.x line. A breaking change is a minor version.
- The first public version is `0.3.3`. It is rebuilt from earlier versions
  (0.1.0 to 0.3.2) that were never published. The CHANGELOG keeps them under
  "History before the first public release".
- Most exports are stable for 0.x. The lifecycle runner and the reconcile run
  are experimental. Each experimental export carries `@experimental` and is
  listed in the README. A test checks that the two agree.

## Why

- The record, the envelope and the process scan have settled. The lifecycle
  runner and the reconcile run depend on how launchers use them, and that use has
  not settled yet.
- Experimental means the export may change or go in any minor release, with a
  CHANGELOG entry. It does not mean the export is unfinished or untested.

## Consequences

- Removing or renaming a stable export, or changing its shape so callers
  break, is listed under "Breaking" in the CHANGELOG.
- Moving an item out of the experimental list is not a breaking change.
- A 1.0.0 release is a later decision.
