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
- A library can move to its own repository later if it grows.

## Licenses

Each library carries its own license, named in its manifest and kept as
license files in its directory. The TypeScript libraries are MIT. The Rust
crates are `MIT OR Apache-2.0`. The root `LICENSE` of this repository
applies to the repository root only, not to the libraries under
`packages/`.

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
- `packages/rust/etag-write` (`etag-write` on crates.io)

The development repository takes them from npm or crates.io, like any other
consumer.
Open issues and pull requests here.

### Releasing a library developed here

1. In the pull request that makes a change users can see, add a changeset:
   run `pnpm changeset` at the repository root, pick the libraries and the
   bump, and write the summary. It lands in `.changeset/` and becomes the
   CHANGELOG entry. Start a breaking change's summary with `**Breaking:**`.
   Do not edit `version` or `CHANGELOG.md` by hand.
2. When the pull request merges, `packages-publish.yml` opens or updates one
   "Version Packages" pull request. It bumps each library's version and
   writes its CHANGELOG from the pending changesets.
3. The Version Packages pull request is opened by GitHub Actions, so its
   checks wait for approval. Select "Approve workflows to run" on it, then
   merge it when `test` and `verify` pass.
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

### Rust

`packages/rust/` is a Cargo workspace. Each crate is listed in `members` in
`packages/rust/Cargo.toml` and takes the shared fields (edition, MSRV,
license, repository) and lints from it. `packages/rust/rust-toolchain.toml`
pins the compiler, and rustup installs it on first use.
`.github/workflows/rust-ci.yml` runs the checks below on Linux, macOS and
Windows, plus a build on the MSRV and one with minimal dependency versions.
Its `rust` job is the one check to require.

```sh
cd packages/rust
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```
