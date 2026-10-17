# Libraries hosted in osdlc/osdlc

Each folder under `packages/<language>/` is one library, published from this
repository: TypeScript libraries to npm, Rust crates to crates.io. Each
library's own README says how to use it. This file covers what holds for all
of them.

## Home and publishing

- Each library lives in `packages/<language>/<name>/`, for example
  `packages/ts/command-seam/`. TypeScript libraries are under `packages/ts/`
  and Rust crates under `packages/rust/`.
- TypeScript libraries are published to npm from CI with
  [Changesets](https://changesets.dev). `.github/workflows/packages-publish.yml`
  publishes through npm trusted publishing, with provenance, so no npm token
  is stored. Only a new library's placeholder version is published by hand
  (see below).
- Each published npm version gets a git tag and a GitHub release named
  `<package>@<version>`, for example `@osdlc/command-seam@0.4.0`. The sdlc
  CLI's own tags are plain `vX.Y.Z`.
- Rust crates are published to crates.io from CI with
  [release-plz](https://release-plz.dev), through
  `.github/workflows/release-plz.yml`. Each release is tagged
  `<crate>/vX.Y.Z`, for example `etag-write/v0.1.0`, and gets a GitHub
  release. The crate name keeps one crate's tags apart from another's, so
  it must be unique across `packages/rust/`.
- A library can move to its own repository later if it grows.

## Licenses

Each library carries its own license, named in its manifest and kept as
license files in its directory. `command-seam`, `tsconfig` and
`prettier-config` are MIT. The Rust crates and the other TypeScript
libraries are `MIT OR Apache-2.0`. The root `LICENSE` of this repository
applies to everything outside `packages/`.

## Why one repository

One public repository is simpler to secure and maintain than one per library.
The libraries change together: the shared TypeScript and Prettier configs set
the rules for the others. `command-seam` links both through this workspace,
so a config change here runs against its build in CI.

## Where changes are made

Developed here, in this repository:

- `packages/ts/tsconfig` (`@osdlc/tsconfig`)
- `packages/ts/prettier-config` (`@osdlc/prettier-config`)
- `packages/ts/command-seam` (`@osdlc/command-seam`)
- `packages/ts/gfm-table` (`@osdlc/gfm-table`)
- `packages/rust/etag-write` (`etag-write` on crates.io)
- `packages/rust/tiered-dirs` (`tiered-dirs` on crates.io)
- `packages/rust/yaml-splice` (`yaml-splice` on crates.io)
- `packages/rust/yaml-splice-wasm`, the WebAssembly build of `yaml-splice`
  for its npm package (not published to crates.io)
- `packages/ts/etag-write` (`@osdlc/etag-write` on npm, the crate's TypeScript twin)

The development repository will take each TypeScript library from npm, like
any other consumer. Today it still keeps its own copies. Open issues and pull
requests here.

### Releasing a TypeScript library

1. In the pull request that makes a change users can see, add a changeset:
   run `pnpm changeset` at the repository root, pick the libraries and the
   bump, and write the summary. It lands in `.changeset/` and becomes the
   CHANGELOG entry. Start a breaking change's summary with `**Breaking:**`.
   Do not edit `version` or `CHANGELOG.md` by hand.
2. When the pull request merges, `packages-publish.yml` opens or updates one
   "Version Packages" pull request. It bumps each library's version and
   writes its CHANGELOG from the pending changesets.
3. The osdlc-release GitHub App opens the Version Packages pull request, so
   its checks start on their own. Merge it when `test` and `verify` pass.
4. On that merge, `packages-publish.yml` runs the full `verify` matrix and
   the package checks again, then publishes every bumped library. A version
   already on npm is skipped, so re-running a failed run is safe. If
   `publish` fails on the npm side, fix the trusted publisher setting on
   npmjs.com and re-run the failed jobs.

### Publishing a new library for the first time

npm can only set up trusted publishing on a package that already exists, so
CI cannot publish a new library's first version. Before its first release:

1. The owner publishes a placeholder version by hand, `0.0.1-stage`, with
   `npm publish --access public --tag stage`. npm reserves `0.0.0-stage`.
   npm points `latest` at a new package's first version even with `--tag`,
   so the placeholder is `latest` until the first CI release moves it. The
   placeholder stays on npm.
2. On npmjs.com, under the package's Settings, Trusted publisher, the owner
   adds repository `osdlc/osdlc` and workflow `packages-publish.yml`.

Until then, `packages-publish.yml` stops before publishing and names the
library that is not on npm yet.

### Releasing a Rust crate

Rust crates are released by `.github/workflows/release-plz.yml` with
[release-plz](https://release-plz.dev). Its settings are in
`packages/rust/release-plz.toml`.

1. On each push to `main`, release-plz opens or updates a release pull
   request. It bumps the version and changelog of each crate with unreleased
   changes. Merge it when its checks pass.
2. On each push to `main`, the workflow also checks crates.io. When a
   crate's version is not published yet, the release job waits for approval
   of the `crates-io` environment. Once approved, it publishes the crate,
   tags it `<name>/vX.Y.Z` and creates a GitHub release.
3. A new crate's first release is published with the shared
   `CARGO_REGISTRY_TOKEN` in the `crates-io` environment. Then add a trusted
   publisher for the crate on crates.io (repository `osdlc/osdlc`, workflow
   `release-plz.yml`, environment `crates-io`). Later releases use it and
   need no token.
4. One run uses one credential, so a push must not hold both a crate's first
   release and a new version of a crate already on crates.io. The workflow
   refuses such a run and says how to split it.
5. If the crate is published but the tag or the GitHub release fails, do not
   re-run the job to publish again: crates.io already has the version, so
   the next run skips the crate and never tags it. Create both by hand on
   the commit that was released (the tag ruleset lets an admin do this).
   For example, for etag-write 0.1.0: `git tag etag-write/v0.1.0 <sha>`,
   `git push origin etag-write/v0.1.0`, then
   `gh release create etag-write/v0.1.0 --title "etag-write v0.1.0"` with
   the CHANGELOG section as the notes.
6. A crate that is never released, such as `yaml-splice-wasm`, has
   `publish = false` in its `Cargo.toml` and `release = false` for it in
   `packages/rust/release-plz.toml`. The workflow and release-plz then skip
   it.

## Working on a library

### TypeScript

The repository root is a pnpm workspace that holds only `packages/ts/*`.

```sh
pnpm install
pnpm run typecheck
pnpm run build
pnpm run test
```

The root scripts run each library's script of the same name.

A library can have a smoke check: `tests/smoke.mjs`. It runs the built package
under Node. It imports the package by name, so Node resolves it through
`exports` as a consumer would. The library needs an `exports` field for this:
`pnpm run smoke` relies on Node's self-reference by package name, which works
only with `exports`. The check is not in `files`, so npm users do not get it.
Two things run it:

- The library's `smoke` script, `node tests/smoke.mjs`, run by
  `pnpm run smoke`. Here the name resolves to the library's own `dist/`.
- `pnpm run check:packages`. It installs the packed tarball into an empty
  project, copies the smoke check there and runs it, so the name resolves to
  the installed tarball. The file must not import other files from the
  repository.

The name has no `.test.` part, so the test runner does not pick it up.

### Rust

`packages/rust/` is a Cargo workspace. Each crate is listed in `members` in
`packages/rust/Cargo.toml` and takes the shared fields (edition, MSRV,
license, repository) and lints from it. `packages/rust/rust-toolchain.toml`
pins the compiler, and rustup installs it on first use.
`.github/workflows/rust-ci.yml` runs clippy and the tests on Linux, macOS
and Windows, and the format check, docs and `cargo package` on Linux. It
also tests on the MSRV and with minimal dependency versions, and builds
`yaml-splice-wasm` for `wasm32-unknown-unknown`. Its `rust` job
is the one check to require.

```sh
cd packages/rust
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```
