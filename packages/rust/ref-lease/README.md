# ref-lease

The protocol half of compare-and-swap leases on git refs, for Rust.

[`@osdlc/ref-lease`](https://www.npmjs.com/package/@osdlc/ref-lease) writes a
lease by pushing a commit to a ref with `git push --force-with-lease`, so any
git remote can be the authority. This crate holds the pure parts of that
protocol, so a Rust program reads git's answers and encodes a payload exactly
as the TypeScript package does. It does not run git: the push and the fetch
are not here yet.

- `push_outcome` says what a push's per-ref result means: `Ok`, `CasFailed`
  (another writer got there first) or `GitFailed`.
- `fetch_failure` says what a failed fetch's stderr means: `RefNotFound`,
  `LockContention` (retry) or `GitFailed`.
- `canonical_json` encodes a payload to deterministic bytes, so equal payloads
  hash to the same git blob.

## Install

```sh
cargo add ref-lease
```

## Example

```rust
use ref_lease::{PushFlag, PushOutcome, canonical_json, push_outcome};
use serde_json::json;

// The authority already held the sha we pushed, and we expected it to.
let up_to_date = PushFlag { flag: '=', rejection: None };
assert_eq!(push_outcome(up_to_date, true), PushOutcome::Ok);

// Keys are sorted at every depth, with no whitespace.
let payload = json!({ "owner": "a", "expires": 1.5 });
assert_eq!(canonical_json(&payload), r#"{"expires":1.5,"owner":"a"}"#);
```

## Twin

`@osdlc/ref-lease` is the TypeScript implementation. Both run one conformance
suite, `packages/conformance/ref-lease/suite.json` in the repository, so they
agree on every case in it.

Numbers are encoded as the JavaScript number they parse to, so an integer
above 2^53 loses the precision a JavaScript reader would lose.

## License

MIT OR Apache-2.0.
