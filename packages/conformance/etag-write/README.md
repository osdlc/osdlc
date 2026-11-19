# etag-write

Atomic file writes, sha256 etags and compare-and-swap: write a temp file
beside the target, fsync it, rename it over the target, and refuse a write
whose etag is stale. A reader or a crash sees the old file or the new one.

| Implementation | Language | Directory |
|---|---|---|
| `@osdlc/etag-write` (reference) | TypeScript | `packages/ts/etag-write` |
| `etag-write` | Rust | `packages/rust/etag-write` |

`suite.json` holds the cases. Each section's `description` says what a case
gives and takes. Write a new case's `input` by hand, then run

```sh
pnpm --filter @osdlc/etag-write conformance:write
```

on Linux or macOS to write its `expect` or `error`. Never write those by hand.

Each case builds what its `existing` says in a scratch directory, calls the
function, and compares the result and the file afterwards. Both runners also
check that a write leaves no temp file beside the target, and that a refused
write leaves the file as it was.

This family compares error kinds only. An `error` is `{ "kind": ... }`: the
two implementations' messages differ by design, so a case never sets
`error.message`. The kinds are the same strings on both sides:

| Kind | TypeScript | Rust |
|---|---|---|
| `changed` | `WriteConflictError`, reason `changed` | `WriteError::Conflict` |
| `exists_without_etag` | `WriteConflictError`, reason `exists-without-etag` | `WriteError::ExistsWithoutEtag` |
| `io` | any error with an `errno` code | `WriteError::Io`, `ReadError` |

## Not in the suite

- The temp file's name. TypeScript uses a random suffix and fails on a taken
  name. Rust uses the process id and a counter, and tries 65 names. Neither
  name is observable once a write returns.
- The mode of a new file, which depends on the umask. `write_atomic_mode`
  covers the mode an overwrite keeps, on Unix only. It leaves out the sticky
  bit, which macOS refuses to set on a file.
- A file that exists but cannot be read, such as one with mode `000`. Root
  reads it anyway, so a case would differ by who runs it. A directory at the
  path stands in for it: it exists and cannot be read as a file.
- `atomicWriteAsync` and the `mode` option of the write functions exist only
  in TypeScript.
