---
id: D-M4QW
type: decision
state: proposed
created: 2026-11-22
---

# D-M4QW: Name and command

The owner has not yet confirmed this name. This note proposes it.

## Decision

- The package is `@osdlc/code-stats` on npm.
- The command is `code-stats`, the name the guides and the command's own help use.
- The README tells users to run `npx @osdlc/code-stats`, with the scope.

## Alternatives considered

| Name | Why not |
| --- | --- |
| `code-stats` (unscoped) | Taken on npm by an unrelated tool, version 0.3.1, which also installs a `code-stats` command. |
| `codestats`, `code-stat`, `sloc-stats` | Free on npm, but `codestats` is the crates.io name of a code counter and the Code::Stats web service is `codestats.net`, so the name suggests a service this package is not. |
| Keep it as `stats` inside `@osdlc/diffkit` | The package began there. It also counts trees and compares changes, and a caller that only counts should not install a review-planning tool. |

## Why

- The name says what the package does and is free under the `@osdlc` scope.
- The unscoped `code-stats` package installs a command with the same name. `npx code-stats`
  fetches that package, not this one, so the README and the guides write the scope wherever they
  show `npx`.
- Keeping the command name `code-stats` keeps every example short. A user who installs the
  package gets the command from `node_modules/.bin`, where there is no clash.

## Consequences

- If the owner prefers another name, the package name, the command, the README, the guides and
  the devlink spec change together.
