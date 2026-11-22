---
id: D-01
type: decision
state: proposed
created: 2026-11-07
---

# D-01: Name and scope

## Decision

- The package is `@osdlc/story-harness`, published to npm from this
  repository, `packages/ts/story-harness`.
- It does one job: use a component's static Storybook build as its test
  harness. That covers screenshot baselines, the page setup and story
  readiness that interaction and perf specs share, and the perf measurements
  and report.

## Why

- "Story" ties it to Storybook stories, and "harness" says it drives them as
  tests. No package on npm has the name, scoped or not.

## Consequences

- A hosted review service, a Storybook addon or a test runner of its own
  belongs in another package.
