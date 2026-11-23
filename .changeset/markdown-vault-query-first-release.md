---
'@osdlc/markdown-vault-query': minor
---

First public release. A query engine over a markdown vault. It parses Obsidian Bases (`.base`) files and runs their filters, formulas, views and summaries against the notes of an `@osdlc/markdown-vault` index, in memory, with no Obsidian app. The package has a library API (`parseBase`, `runView`, `queryBase`, `queryExpression`, `queryVault`, and the expression and value types) and a `markdown-vault-query` command with `query`, `filter`, `check` and `views`.

- **Breaking:** the package ships a compiled `dist/` for Node 22 or later, ESM only. The `markdown-vault-query` binary runs under Node. The `bun` export condition is gone, and so is the TypeScript source in the package.
- **Breaking:** `EvalError` is renamed `ExpressionEvalError`, so it no longer shadows the global `EvalError`. There is no alias.
- **Breaking:** `EvalContext` no longer has the `formulaStack` field. It was internal state, and a context you build does not need it.
- `tokenize`, `Token`, `TokenType`, `Expr` and the node types `LiteralExpr`, `RegexExpr`, `ListExpr`, `ObjectExpr`, `IdentExpr`, `PropExpr`, `IndexExpr`, `CallExpr`, `MethodExpr`, `UnaryExpr`, `BinaryOp` and `BinaryExpr` are experimental. They stay exported because `evaluate` takes an `Expr`, and they may change in any release.
- `runLinkResolver` and the `LinkResolver` type are exported. `runLinkResolver(vault)` builds the resolver for `EvalContext.resolveLink`, so a caller of `evaluate` can share one name table across expressions.
- `BaseParseError` passes `cause` to `Error`, so `error.cause` holds the YAML or expression error that caused it.
- Every export has TSDoc and a runnable example. The README says when to use each of the four query functions.
- The README opens with who the package is for, says when not to use it, and compares it with the other packages that read Bases files. It states the tested platforms: Linux and macOS.
- The package is licensed `MIT OR Apache-2.0`.
- An expression or base nested too deeply for the stack ends in the package's own errors. `parseExpression` throws `ExpressionError` and `parseBase` throws `BaseParseError`. `evaluateSafe` returns an `ErrorValue`, which the query functions show in the cell or count as a false filter expression. `evaluate` throws a `RangeError`.
- `queryVault` throws a `RangeError` when `offset` or `limit` is not a non-negative integer, and a view `limit` in a base must be a non-negative integer.
- The CLI rejects an unknown option and `--vault`, `--view` or `--this` with no value, with one line on stderr and exit code 1. An argument after `--` is not read as an option. The usage text for a wrong command line prints on stderr, and `views` reports an invalid base like `query` does.
- The README and SECURITY.md say that a `.base` file and an expression are code-like input, and that a regular expression in one can take unbounded time.
