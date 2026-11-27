# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- `Verifier::verify` read the clock twice (once for the window, once for the replay cache), so
  a request replayed in the last second of its window could be accepted. It reads the clock once
  and uses that reading for both.
- A negative `VerifierConfig::window_secs` was treated as 0 for the window check but not for how
  long a nonce is remembered, which switched replay protection off. Both now use 0.
- The axum middleware now calls the reject hook for the `413` answers (a body over the limit,
  declared or found while reading, and a body that cannot be read). The status codes are unchanged.

### Documentation

- README with install, a worked example, the `axum` and `reqwest` features, a comparison with
  other crates, limits and residual risks, and the platforms and stability notes. It states that the
  scheme is neither RFC 9421 nor AWS SigV4, and that no HTTP header other than the signing headers
  is covered by the signature.
- A doc comment on every public item, with `# Errors` and `# Panics` sections; the accepted range
  of `Signer::sign_at` (timestamps and epochs the verifier refuses); corrections to the stated
  verification order and the default per-key quota.
- Examples (`sign_and_verify`, `key_rotation`, `protect_router`, `signed_client`) that the test
  suite runs; the `ignore`d doc example of the middleware is now a running doc-test.
- `LICENSE-MIT`, `LICENSE-APACHE`, `SECURITY.md` and `CONTRIBUTING.md`.
- docs.rs builds with all features.

### Added

- `#![forbid(unsafe_code)]`.
- Tests for the `429` and `503` answers, the reject hook, `StaticKeys`, `SignedClient::put_json`,
  `SystemClock`, secret redaction in `Debug` output, concurrent duplicate requests and nesting.

- First version: canonical signing string (`det-signed-request/v1`) over direction,
  audience, key id, epoch, method, the request target as sent, timestamp, nonce and the body's
  SHA-256; `Signer`; `Verifier` with a clock-skew window, a bounded nonce replay cache and a
  constant-time compare; golden vectors in `tests/vectors.json`; feature `axum` (middleware and
  `KeyResolver`); feature `reqwest` (`SignedClient`).
- Strict header parsing (lowercase hex, plain-digit epoch and timestamp); a per-key-id replay quota
  (`VerifierConfig::replay_per_key`, 429 in the middleware); cheap checks (header shape, window,
  declared size, key lookup) before the body is read; `SignedClient` signs the `Url` it sends.
- `tests/gen_vectors.py` regenerates `tests/vectors.json` independently of the crate.
