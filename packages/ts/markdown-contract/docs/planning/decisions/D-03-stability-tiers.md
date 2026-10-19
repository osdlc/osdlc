---
id: D-03
type: decision
state: accepted
created: 2026-10-18
---

# D-03: Stability tiers

## Decision

- The package is 0.x. The first published version is 0.3.0.
- Stable exports follow semantic versioning for 0.x. A breaking change goes in
  a minor release and is marked `Breaking` in the CHANGELOG.
- Some exports are experimental. They may change in any minor release without
  a `Breaking` entry in the CHANGELOG. Each carries `@experimental` in its
  TSDoc and is listed in the README's Stability section. At 0.3.0 there are
  eight: `inferConfig`, `InferOptions`, `InferResult`, `InferredContract`,
  `InferredFile`, `TextEdit`, `runCli` and `CliResult`.
- The `markdown-contract` command, its flags and its output formats are
  experimental in the same way.
- Every other export is stable.

## Why

- The package is young, so 1.0.0 would promise more than the history supports.
  0.x with a clear rule on breaking changes says what users can rely on.
- Config inference and the in-process command work and are tested, but their
  shape is not settled. `TextEdit` is carried on `Finding.fix`, and no check
  fills it yet. Marking these lets their shape change without the notice a stable export
  gets.
- Marking an export experimental is cheaper than removing it later.

## Consequences

- A test checks that the README's experimental list and the `@experimental`
  tags agree.
- Moving an export from experimental to stable needs a CHANGELOG entry.
- A new experimental export must carry the tag and be listed in the README.
