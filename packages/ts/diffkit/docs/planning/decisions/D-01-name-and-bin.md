---
id: D-01
type: decision
state: proposed
created: 2026-11-22
---

# D-01: The name and the `diffkit` binary

## Decision

- The package is `@osdlc/diffkit` on npm, and it installs one binary, `diffkit`, whose
  subcommand today is `prep`.
- The package began in sksizer/dev (a private repository) under other names. None was
  published, so no caller has an old name to move from.

## Why

- The package turns a diff into a plan for a reviewer. "diffkit" says it works on diffs and is a
  set of parts, and `prep` names the step.
- The scope `@osdlc` holds the placeholder `0.0.0-stage` and `0.0.1-stage` versions of the name,
  so it is already ours on npm.
- The unscoped npm package `diffkit` is an unrelated command-line tool for another site. It also
  installs a binary named `diffkit`, and its last release was in 2022. Installing both globally
  makes the two claim one command. A crate named `diffkit` on crates.io is an unrelated sequence
  diff library.

## Alternatives considered

| Name | Why not |
| --- | --- |
| `pr-stats` (the name it began with) | The package no longer prints statistics. [`@osdlc/code-stats`](https://github.com/osdlc/osdlc/tree/main/packages/ts/code-stats) does. |
| `@osdlc/diff-kit` | Free, but hyphenates a name the binary spells without one. |
| A different binary name | Avoids the clash, but then the command and the package disagree, and `npx @osdlc/diffkit` would need a flag to pick the binary. |

## What is proposed

The owner confirms the package name, and that the binary keeps the clashing name `diffkit`.
The recommendation is to keep both: the unscoped package is unmaintained, and a user who runs
`npx @osdlc/diffkit` gets the right binary either way.

## Reopen if

The unscoped `diffkit` package is updated and starts to collide with this one in practice.
