---
id: D-04
type: decision
state: accepted
created: 2026-11-07
---

# D-04: Harness ids come from `@osdlc/detect-harness`

## Decision

- The package keeps no table of harnesses of its own. The built-in ids are `BUILTIN_HARNESSES`
  from `@osdlc/detect-harness`: `claude`, `codex`, `cursor`, `opencode`, `pi` and `antigravity`.
- `harnessOrNull` maps what a host reports running in a pane to one of those ids through
  `harnessId`, which also takes the spellings in `HARNESS_ALIASES` (`cursor-agent` is `cursor`,
  `agy` is `antigravity`). Anything else is null.
- `HarnessSchema` accepts any tool id (a lowercase letter, then lowercase letters, digits and
  hyphens), so a caller can run a tool the built-in list does not name.
- The package does not depend on a model catalogue.

## Why

The package once used an unpublished catalogue library for the tool-id pattern, the built-in
ids and their executables, so it could not be installed. A table of its own replaced that, and
then drifted from the one in `@osdlc/detect-harness`, which the package already depends on to
find executables. One list, in the library whose job is naming harnesses, cannot drift.

## Consequences

- A new agent CLI is an id in `@osdlc/detect-harness` and an interactive argv builder in
  `harness.ts`.
- A consumer that keeps its own list of harnesses checks it against `BUILTIN_HARNESSES`.
