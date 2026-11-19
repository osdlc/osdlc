# ref-lease

Compare-and-swap leases on git refs, with a remote as the authority. This
family covers the pure half of the protocol: how a push result and a fetch
error are read, and the canonical JSON a lease payload is written as.

| Implementation | Language | Directory |
|---|---|---|
| `@osdlc/ref-lease` (reference) | TypeScript | `packages/ts/ref-lease` |
| `ref-lease` | Rust | `packages/rust/ref-lease` |

`suite.json` holds the cases. Each section's `description` says what a case
gives and takes. Write a new case's `input` by hand, then run

```sh
pnpm --filter @osdlc/ref-lease conformance:write
```

to write its `expect`. Never write that by hand.

| Section | Function (TypeScript / Rust) |
|---|---|
| `push_outcome` | `pushOutcome` / `push_outcome` |
| `fetch_failure` | `fetchFailure` / `fetch_failure` |
| `canonical_json` | `canonicalJson` / `canonical_json` |

## Not in the suite

- The push and fetch themselves, which need a git remote. The Rust crate has
  no git half yet, so the TypeScript package's integration tests cover them
  alone.
- Values `canonicalJson` refuses (`undefined`, functions, a `Map`, a cycle):
  JSON input cannot hold them, so the Rust crate has nothing to refuse.
- `toJSON`, and `NaN` and infinity as `null`: JSON input cannot hold them.
