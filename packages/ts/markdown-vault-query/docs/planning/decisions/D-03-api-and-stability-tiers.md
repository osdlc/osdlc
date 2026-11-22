---
id: D-03
type: decision
state: proposed
created: 2026-11-22
---

# D-03: The API of the first release and its stability tiers

## Decision

This is proposed: the owner signs off the API before the first release.

The package has one entry point, `@osdlc/markdown-vault-query`, and one command,
`markdown-vault-query`.

| Item                                                                     | Decision                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `tokenize`, `Token`, `TokenType`                                         | Experimental. The lexer is an implementation detail of `parseExpression`.                      |
| `Expr` and the twelve node types of the syntax tree                      | Experimental. `evaluate` takes an `Expr`, so they stay exported, but the grammar may change.   |
| `EvalContext`                                                            | Stable. The formula stack that cycle detection uses is an internal type and is not part of it. |
| `LinkResolver`, `runLinkResolver`                                        | Exported. `fromFrontmatter` and `EvalContext.resolveLink` need them.                           |
| `EvalError`                                                              | Renamed `ExpressionEvalError`, so it no longer shadows the global `EvalError`. No alias.       |
| `BaseParseError`                                                         | Passes `cause` to `Error`, so `error.cause` is set.                                            |
| `runView`, `queryBase`, `queryExpression`, `queryVault`                  | Kept. They differ in what they run and return. The README says when to use each.               |
| Every other export                                                       | Stable within a 0.x minor line.                                                                |

## Why

- A caller of `evaluate` could not build the resolver the context takes, and `fromFrontmatter`
  showed a type no one could import. Exporting `runLinkResolver` and `LinkResolver` closes both.
- Keeping the lexer and the node types behind an experimental tag lets the grammar grow a new
  operator or literal in a minor release without breaking the stable surface.
- The three filter entry points have three option shapes because they return three shapes. Merging
  them would hide that, so they stay and are documented.
- Renames and removals carry no alias. The package is 0.x and has not been published.

## Consequences

- A breaking change to a stable export ships only in a new 0.x minor release, with a CHANGELOG
  entry that starts with `Breaking:`.
- The README lists the experimental exports, and `tests/exports.test.ts` fails when that list, the
  `@experimental` tags, `package.json` `exports` or the examples disagree.
