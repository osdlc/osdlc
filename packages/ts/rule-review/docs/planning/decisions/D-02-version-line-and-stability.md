---
id: D-02
type: decision
state: accepted
created: 2026-11-07
---

# D-02: Version line and stability

## Decision

- The package is on the 0.x line. The first public version is 0.4.0: the
  unpublished history reached 0.3.0, and the first release breaks its API.
- The review side is stable within a minor version: `reviewChanges`,
  `review`, the rule-source types, the changeset readers and the findings.
- The check-folder runner is experimental: `rule-review checks` and every
  export the README's Stability section lists. Each carries `@experimental`,
  and `tests/stability.test.ts` fails when the list and the tags differ.
- Parsing helpers, the matcher and the CLI's own wiring are not exported.

## Why

- The review API has one consumer, and its shape (providers, rule sources,
  one judgement per source) has held since the first version.
- The check runner is young, and prompt checks
  ([T-01](../tasks/T-01-prompt-checks.md)) and concurrency
  ([T-02](../tasks/T-02-same-prefix-concurrency-and-fail-fast.md)) will change
  its result types.
- 1.0 waits for a second consumer and a release with no breaking change.

## Consequences

- A breaking change ships only in a new minor version, and the CHANGELOG
  marks it with **Breaking:**.
- Promoting a check export to stable removes its tag and its README listing in
  one pull request.
