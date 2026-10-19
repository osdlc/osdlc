# tiered-dirs planning

Why the Rust crate `tiered-dirs` has the shape it has. The
[README](../../README.md) says how to use the crate.

The decisions both twins share live in the TypeScript package's folder:
[`packages/ts/tiered-dirs/docs/planning`](../../../../ts/tiered-dirs/docs/planning/README.md).
They cover the name and scope, the version line, errors, the test root, the
platforms and the licence.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Rust-only decisions

- `TierKind`, `Convention`, `Error`, `EnvVars` and `ResolveOptions` are
  `#[non_exhaustive]`, so a later release can add a variant or a field. A
  `match` outside the crate needs a `_` arm. `Home` is exhaustive, because
  adding a home is a breaking release. The TypeScript twin writes the same
  growth rule in its docs.
- A test is detected by its binary: one in a `deps` folder, run with `CARGO`
  or `NEXTEST` set. The TypeScript twin detects a test runner process
  instead, and it adds a rule for a moved `HOME`. See
  [D-05](../../../../ts/tiered-dirs/docs/planning/decisions/D-05-test-root.md).
- `BaseDirs::from_env_with` and `TieredDirs::from_env_with` apply neither
  test rule, so a test that wants the OS defaults can ask for them.
- `assert_vendor_bundle_id` is a debug-only assert. TypeScript has no debug
  build, so it has only `isVendorBundleId`.
