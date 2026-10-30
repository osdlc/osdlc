# tiered-dirs

Where a program keeps its files: a vendor, suite or standalone tier, one of
the per-OS homes (durable, config, cache, state, logs, runtime) or scratch,
and an optional scope and app below it. The family also resolves the base
directories from override variables and the XDG convention.

| Implementation | Language | Directory |
|---|---|---|
| `@osdlc/tiered-dirs` (reference) | TypeScript | `packages/ts/tiered-dirs` |
| `tiered-dirs` | Rust | `packages/rust/tiered-dirs` |

`suite.json` holds the cases. Each section's `description` says what a case
gives and takes. Write a new case's `input` by hand, then run

```sh
pnpm --filter @osdlc/tiered-dirs conformance:write
```

on Linux or macOS to write its `expect` or `error`. Never write those by hand.

Each implementation's README lists what it does that the other does not: how
it finds the home directory, and its own error messages, which the suite does
not compare.
