# signed-request

HMAC-SHA256 signing and verification of HTTP requests between two services that
share a secret, with a clock-skew window, a bounded replay cache and key
rotation. Optional [axum](https://crates.io/crates/axum) middleware for the
receiving side and a [reqwest](https://crates.io/crates/reqwest) client for the
sending side.

One service signs the method, the request target, the body and a few fields
that say who is talking to whom. The other checks the signature, refuses a
timestamp outside a window and refuses a nonce it has already accepted. A
signature made for one direction, audience or key generation does not verify in
another.

This is a small scheme of its own. It is **neither
[RFC 9421](https://www.rfc-editor.org/rfc/rfc9421) (HTTP Message Signatures) nor
AWS Signature Version 4**, and it does not interoperate with either. Both ends
must use this crate (or an implementation of the wire format below).

## Who it is for

Two backends you control that call each other over HTTP and share a per-peer
secret: a control plane and the agents or tenants it manages, a gateway and an
internal service, a job runner and a callback endpoint. Both directions of one
pair can use the same scheme; the direction is part of what is signed.

## When not to use it

- **To interoperate with a third party.** Use the scheme the other side speaks:
  RFC 9421 (for example the `httpsig` crate), a provider's webhook format, or
  SigV4.
- **For public clients, browsers or user accounts.** There is one shared secret
  per key id and no user model. Use sessions, OAuth or mutual TLS.
- **With asymmetric keys.** Both ends hold the same secret. A verifier can also
  sign. If the verifier must not be able to forge requests, use public-key
  signatures.
- **When one accepted request must never happen twice across restarts or
  replicas.** The replay cache is in memory, per process: see
  [Replay and clock limits](#replay-and-clock-limits).
- **To protect headers.** Only the method, target and body are signed: see
  [What is signed](#what-is-signed).

## How it compares

| Crate | What it does | What this adds |
|---|---|---|
| `httpsig`, `httpsig-hyper` | RFC 9421 message signatures with HMAC-SHA256 among the algorithms | RFC 9421 is a different wire format and leaves replay protection, key rotation and who-talks-to-whom to the application. This crate fixes one format and includes those, at the cost of interoperability |
| `nonce-auth` | HMAC over bytes you pass, with a nonce and a time window | Binding the method, target, body, direction, audience and key epoch; the axum and reqwest layers |
| Webhook verifiers (`webhookkit`, `webhook-verify` and similar) | Check the signature formats of Stripe, GitHub, Slack and other providers | A format of your own for service-to-service calls, in both directions, with a replay cache |
| `reqsign` | Signs requests for cloud providers (SigV4 and others) | A verifier, and a scheme that is not tied to a provider |

## Install

```sh
cargo add signed-request
```

With the middleware and the client:

```sh
cargo add signed-request --features axum,reqwest
```

| Feature | Adds | Depends on |
|---|---|---|
| `axum` | `signed_request::middleware`: `protect`, `Guard`, `KeyResolver`, `StaticKeys` | `axum` 0.8, `async-trait` |
| `reqwest` | `signed_request::client`: `SignedClient`, `ClientError` | `reqwest` 0.12 |

Both are off by default and independent of each other. `reqwest::Client` is part
of the client's public API, so a move to another reqwest major is a minor version
bump of this crate.

## Quick start

Sign on one side, verify on the other. Both read the time from a `Clock`;
`SystemClock` is the wall clock and `ManualClock` lets a test move time by hand.

```rust
use std::sync::Arc;

use signed_request::{
    Direction, Presented, Signer, SystemClock, Verifier, VerifierConfig, VerifyError, VerifyKey,
};

let secret = b"0123456789abcdef0123456789abcdef".to_vec(); // 32 random bytes in real use
let clock = Arc::new(SystemClock);

// The sending side: key id "acme", epoch 1, messages from a tenant to the control side.
let signer = Signer::new(
    "acme",
    1,
    secret.clone(),
    Direction::TenantToControl,
    "control",
    clock.clone(),
);
let headers = signer.sign("POST", "/orders?id=7", b"{\"qty\":2}").unwrap();

// The receiving side: accepts only that direction and audience.
let verifier = Verifier::new(
    VerifierConfig::new(Direction::TenantToControl, "control"),
    clock,
);
let keys = vec![VerifyKey { epoch: 1, secret }];

// `headers.pairs()` are the five `(name, value)` pairs to put on the request. On the other end,
// read them back from the request's headers.
let pairs = headers.pairs();
let presented =
    Presented::parse(|name| pairs.iter().find(|(n, _)| *n == name).map(|(_, v)| *v)).unwrap();

let verified = verifier
    .verify(&presented, "POST", "/orders?id=7", b"{\"qty\":2}", &keys)
    .unwrap();
assert_eq!((verified.key_id.as_str(), verified.epoch), ("acme", 1));

// The same request again is a replay; the same signature on another body does not verify.
assert_eq!(
    verifier.verify(&presented, "POST", "/orders?id=7", b"{\"qty\":2}", &keys),
    Err(VerifyError::Replay)
);
let again = signer.sign("POST", "/orders?id=7", b"{\"qty\":2}").unwrap();
let pairs = again.pairs();
let presented =
    Presented::parse(|name| pairs.iter().find(|(n, _)| *n == name).map(|(_, v)| *v)).unwrap();
assert_eq!(
    verifier.verify(&presented, "POST", "/orders?id=7", b"{\"qty\":3}", &keys),
    Err(VerifyError::BadSignature)
);
```

During a key rotation the receiving side passes several keys, one per epoch it
still accepts; the request's epoch header picks the one to check against.

### With axum (feature `axum`)

`protect` puts the check in front of every route of a router, and a handler
reads the verified key id with `Extension<Verified>`. You supply a
`KeyResolver` that maps a key id to its keys (or `StaticKeys` for one fixed id).

```rust,ignore
let guard = Arc::new(Guard::new(verifier, Arc::new(resolver)));
let app = signed_request::middleware::protect(routes, guard);
// handlers: async fn h(Extension(v): Extension<Verified>) { ... }
```

A request that fails gets the same `401 {"error":"unauthorized"}` whatever the
reason. The exceptions are `413` (body over the limit, 1 MiB by default), `429`
(a key id at its replay quota) and `503` (the replay cache is full). The reason
goes to an optional reject hook for logging. See `examples/protect_router.rs`.

### With reqwest (feature `reqwest`)

`SignedClient` signs the URL it sends, so what is signed is the target the
server sees. Build the reqwest client with redirects off: reqwest would
otherwise forward the key id and epoch headers to wherever a redirect points.

```rust,ignore
let http = reqwest::Client::builder()
    .redirect(reqwest::redirect::Policy::none())
    .build()?;
let client = SignedClient::new(http, "https://control.internal:8443", signer);
let response = client.post_json("/orders", br#"{"qty":2}"#).await?;
```

Paths given to the client must start with `/`. See `examples/signed_client.rs`.

## Wire format

Five request headers: `x-det-id` (key id), `x-det-epoch` (key generation,
plain decimal digits), `x-det-ts` (unix seconds), `x-det-nonce` (16 to 64
characters of `A-Za-z0-9_-`) and `x-det-sig` (lowercase hex HMAC-SHA256). The
`det` in the names is only a prefix. The signature is over a string of ten
lines joined by `\n`, with no trailing newline:

```text
det-signed-request/v1
<direction>            tenant-to-control | control-to-tenant
<audience>             who the message is for ("control", or a tenant id)
<key id>
<epoch>
<METHOD>
<target>               path and query exactly as sent: not decoded, not sorted
<ts>
<nonce>
<hex sha256 of the body>
```

Every variable field is restricted so that none can hold a newline and the string
parses one way. Parsing of the headers is strict (no sign, no leading zeros,
lowercase hex only), so a captured signature cannot be re-encoded. The secret
and the string are fed to HMAC-SHA256 and the result is compared in constant time.
Golden vectors, produced by an independent Python script, are in
`tests/vectors.json`.

The two directions are called `tenant-to-control` and `control-to-tenant`:
two roles, many callers and one callee. Which of your services plays which is
your choice.

## What is signed

The signature covers the direction, the audience, the key id, the key epoch, the
method, the request target (path and query, as sent), the timestamp, the nonce
and the SHA-256 of the body.

**No HTTP header other than the five `x-det-*` ones is covered.** `Content-Type`,
`Host`, `Authorization`, an `Idempotency-Key` and every other header can be
changed in transit without invalidating the signature. A value that must be
protected has to be in the body or the query string. Signing the target
as sent means a proxy that rewrites or reorders the query breaks the signature
rather than getting past it.

## Replay and clock limits

- **Per process.** The nonce cache is in memory. After a restart it is empty, so a
  request captured within the last window (60 seconds by default) can be replayed
  once. With several replicas each has its own cache, so one request can be
  accepted once per replica. Do not send non-idempotent requests through a window
  you cannot defend, or keep nonces in shared storage.
- **Bounded, and it fails closed.** The cache holds at most 10 000 nonces and
  1 250 per key id by default. When a key id is at its quota the request is
  refused (`429` in the middleware), and when the whole cache is full of live
  entries it is refused too (`503`), rather than forgetting an entry that could
  then be replayed. At the defaults that bounds one key id to roughly 20
  requests per second. Raise `VerifierConfig::replay_capacity` and
  `replay_per_key` together if you need more.
- **A forged request never reaches the cache.** A nonce is recorded only after the
  signature has verified.
- **The clock matters both ways.** A timestamp further than `window_secs` from the
  verifier's clock is refused, so the two clocks must agree to within the window.
  If a verifier's clock is stepped back after an entry was dropped, that request
  can be accepted again. A negative `window_secs` counts as 0.
- **Epochs.** Which epochs are accepted is the caller's decision: it passes the
  candidate keys, which is how a rotation keeps the previous epoch alive for a
  grace window.

## Residual risks

Known limits you should design around:

- **Buffering before the MAC is checked.** In the middleware, a caller who knows a
  valid key id can make the server buffer and hash up to the body limit (1 MiB by
  default) per request before the signature fails. Unknown key ids are refused
  earlier. Rate-limit callers at the edge, and lower `Guard::with_max_body` if
  your bodies are small.
- **Secrets are plain bytes.** `VerifyKey::secret` and the `Signer`'s secret are
  ordinary `Vec<u8>`s: cloneable and not wiped from memory on drop. `Debug` output
  hides them. There is no minimum key length; an empty secret signs and verifies.
  Use at least 32 random bytes.
- **Redirects leak the identity headers.** reqwest follows redirects by default
  and forwards the `x-det-id` and `x-det-epoch` headers. Build the client with
  `redirect::Policy::none()`. The signature itself is for one target and is useless
  at another.
- **Replay protection is per process and the clock can be stepped back.** See above.
- **Headers are not signed.** See above.
- **Path handling.** The client builds its URL by joining the base and the path,
  so a path that does not start with `/` can change the destination. Pass paths
  your own code produced. In the middleware, a router protected with `protect` must
  not be `nest`ed under a prefix (the prefix is stripped before the check and every
  request is refused): nest first, then protect the result. Routes added to the
  router after `protect` are not covered.
- **The crate has not been independently audited.**

To report a vulnerability, see `SECURITY.md`.

## Supported versions

Rust 1.89 or newer (edition 2024).

## Platforms

Linux, macOS and Windows. The crate has no platform-specific code: no file, path
or process access. Randomness comes from the operating system through
`getrandom`.

## Stability

This is a 0.x crate. Breaking changes are possible between minor versions and are
listed in `CHANGELOG.md`. That includes the wire format, which a peer on another
version must match exactly.

## License

Licensed under either of Apache License, Version 2.0 (`LICENSE-APACHE`) or MIT
license (`LICENSE-MIT`) at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this crate by you, as defined in the Apache-2.0 license, shall
be dual licensed as above, without any additional terms or conditions.
