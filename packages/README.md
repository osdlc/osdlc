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
license files in its directory. `command-seam`, `typed-git`, `tsconfig` and
`prettier-config` are MIT. The Rust crates and the other TypeScript
libraries are `MIT OR Apache-2.0`. The root `LICENSE` of this repository
applies to everything outside `packages/`.

## Why one repository

One public repository is simpler to secure and maintain than one per library.
The libraries change together: the shared TypeScript and Prettier configs set
the rules for the others. `command-seam` links both through this workspace,
so a config change here runs against its build in CI.

## Twin libraries

A twin is two separate implementations of one library, one in Rust and one
in TypeScript, such as the `tiered-dirs` crate and `@osdlc/tiered-dirs`. A
build of one implementation for another runtime, such as `@osdlc/yaml-splice`
(the crate built to WebAssembly), is not a twin and keeps its own version.
The rules below apply when both halves are hosted here. A twin whose other
half lives elsewhere, such as `@osdlc/frontmatter-lossless`, adopts them when
that half moves here. Twins keep semantic parity, not literal parity.

- **Same behaviour.** For the same input, both twins return the same result
  or refuse it with the same error kind. A shared fixture of cases checks
  it: `packages/rust/<name>/tests/fixtures/parity.json`, run by both twins'
  tests. `tiered-dirs` and `path-guard` have one. `etag-write` does not
  have one yet.
- **Each language's idiom.** A twin does not copy the other's names or
  signatures when that breaks its own language's habits. Rust uses
  snake_case, `Result`, traits and the standard library's words. TypeScript
  uses camelCase, thrown errors, classes and subpath exports. Values the
  fixture compares, such as error kind strings, keep one spelling.
- **One-sided features are allowed.** A twin may have an export the other
  language has no use for. Its README lists such exports.
- **Versions.** Twins share the major and minor version. Patch releases are
  independent. `tiered-dirs`'
  [D-02](ts/tiered-dirs/docs/planning/decisions/D-02-version-line-and-stability.md)
  applies this rule to one twin.
- **Skipping versions to catch up.** One twin may release a breaking change
  before the other is ready. The other then skips one or more versions to
  return to the shared major and minor. For example, if the crate is at 0.3
  while the TypeScript package is at 0.1, the package's next release is
  0.3.0, with no 0.2. A changeset cannot jump versions, so the pull request
  that catches up sets `version` in `package.json` by hand. This is the one
  case where that is allowed.
  `@osdlc/tiered-dirs` did this: its first release was 0.3.0, as its
  [D-02](ts/tiered-dirs/docs/planning/decisions/D-02-version-line-and-stability.md)
  records.

## Where changes are made

Developed here, in this repository:

- `packages/ts/tsconfig` (`@osdlc/tsconfig`)
- `packages/ts/prettier-config` (`@osdlc/prettier-config`)
- `packages/ts/command-seam` (`@osdlc/command-seam`)
- `packages/ts/gfm-table` (`@osdlc/gfm-table`)
- `packages/rust/cli-tool-config` (`cli-tool-config` on crates.io, last release 0.5.3; replaced by `config-layers`)
- `packages/rust/config-layers` (`config-layers`, not yet on crates.io; its first release is held)
- `packages/rust/etag-write` (`etag-write` on crates.io)
- `packages/rust/path-guard` (`path-guard` on crates.io)
- `packages/rust/tiered-dirs` (`tiered-dirs` on crates.io)
- `packages/rust/yaml-splice` (`yaml-splice` on crates.io)
- `packages/rust/yaml-splice-wasm`, the WebAssembly build of `yaml-splice`
  for its npm package (not published to crates.io)
- `packages/ts/yaml-splice` (`@osdlc/yaml-splice` on npm, the crate built to
  WebAssembly, with the built `wasm/` committed)
- `packages/ts/etag-write` (`@osdlc/etag-write` on npm, the crate's TypeScript twin)
- `packages/ts/frontmatter-lossless` (`@osdlc/frontmatter-lossless` on npm,
  the TypeScript twin of the `frontmatter-lossless` crate, which has not moved
  here yet)
- `packages/ts/color` (`@osdlc/color` on npm, sRGB colour arithmetic for
  contrast checks)
- `packages/ts/agent-call` (`@osdlc/agent-call` on npm, one call spec for
  headless coding-agent CLIs)
- `packages/ts/observe` (`@osdlc/observe` on npm, a JSONL log envelope with
  correlation ids, agent session records, a process scan and reconcile)
- `packages/ts/tiered-dirs` (`@osdlc/tiered-dirs` on npm, machine-local
  directories by tier and home, the TypeScript twin of the `tiered-dirs` crate)
- `packages/ts/markdown-contract` (`@osdlc/markdown-contract` on npm,
  contracts for markdown documents: one parse gives findings with lines and a
  typed model; contracts in TypeScript or YAML, a folder runner and a CLI)
- `packages/ts/path-guard` (`@osdlc/path-guard` on npm, a path containment
  guard: lexical validation, then a symlink-aware proof that a path stays
  inside its root; the TypeScript twin of the `path-guard` crate)
- `packages/ts/typed-git` (`@osdlc/typed-git` on npm, a typed git client for
  TypeScript, in a synchronous and an awaitable form; each verb declares what
  absence means for it and every other failure throws)
- `packages/ts/intersect` (`@osdlc/intersect` on npm, a path-pattern overlap
  engine: do two globs share a path, with a witness path, a registry and an
  optional filesystem layer)
- `packages/ts/detect-harness` (`@osdlc/detect-harness` on npm, finds the
  coding-agent harnesses on a machine and in a project and reads what each has
  configured; read-only, with secrets redacted)

The development repository will take each TypeScript library from npm, like
any other consumer. Today it still keeps its own copies. Open issues and pull
requests here.

### Releasing a TypeScript library

1. In the pull request that makes a change users can see, add a changeset:
   run `pnpm changeset` at the repository root, pick the libraries and the
   bump, and write the summary. It lands in `.changeset/` and becomes the
   CHANGELOG entry. Start a breaking change's summary with `**Breaking:**`.
   Do not edit `version` or `CHANGELOG.md` by hand, except when a twin
   skips versions to catch up (see [Twin libraries](#twin-libraries)).
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
CI cannot publish a new library's first version. Before its first release
the owner does the two steps below.
`node .github/scripts/stage-npm-package.mjs packages/ts/<name>` does both.
It skips a step that is already done. `--dry-run` builds the package and
shows what it would publish, without changing anything on npm.

1. The owner publishes a real build as a placeholder version, `0.0.1-stage`:
   set the version to `0.0.1-stage` without committing it, run
   `pnpm run build` and `pnpm pack`, then
   `npm publish ./<tarball>.tgz --access public --tag stage`. Use
   `pnpm pack`, not `npm pack`: it rewrites `workspace:` and `catalog:`
   versions. npm reserves `0.0.0-stage`. npm points `latest` at a new
   package's first version even with `--tag`, so the placeholder is `latest`
   until the first CI release moves it. The placeholder stays on npm.
2. The owner adds a GitHub Actions trusted publisher with permission to
   publish: repository `osdlc/osdlc`, workflow `packages-publish.yml`, and
   no environment. The script runs `npm trust github`, which needs npm 11.15
   or later and two-factor authentication on the account. The same settings
   are on npmjs.com under the package's Settings, Trusted publisher.

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

#### Versions and breaking changes

- A pull request with a breaking change sets the crate's new version in the
  crate's `Cargo.toml` itself. Before 1.0, bump the minor: 0.2.2 becomes
  0.3.0. From 1.0, bump the major. Also update the crate's `version` in
  `[workspace.dependencies]` when it is listed there.
- Do not use `!` or `BREAKING CHANGE` in a pull request title. release-plz
  would bump the minor for it. The version is set in `Cargo.toml`.
- A non-breaking change leaves the version alone. release-plz bumps the
  patch in its release pull request.
- A bumped version is not on crates.io, so the push that merges it starts a
  release. Once the `crates-io` environment is approved, the crate is
  published and tagged. No release pull request is needed.
- Pull requests are squash-merged, and the squash commit takes the pull
  request title. release-plz writes the CHANGELOG from commits, so the title
  becomes a CHANGELOG line. Write it for readers.
- For a change that does not bump the version, do not write a CHANGELOG
  entry by hand. release-plz generates it in the release pull request.
- A pull request that bumps the version writes the CHANGELOG section for
  that version by hand, with its own entries. It goes as its own section,
  below the `## [Unreleased]` heading, for example
  `## [0.3.0] - 2026-10-17`. Without it, the GitHub release takes the notes
  of the previous section, because the release runs before any release pull
  request.
- release-plz never adds to a hand-written section. That section is the only
  record for that version. Approve the release before merging more changes
  to that crate, or add those changes to the section by hand.
- The `semver-version` job in `.github/workflows/rust-ci.yml` runs
  cargo-semver-checks on each changed crate that is on crates.io. When it
  finds a breaking change and the version is not bumped, the job fails and
  names the version to set. A change to the workspace `Cargo.toml` or
  `Cargo.lock` checks every published crate. cargo-semver-checks misses some
  breaking changes, such as a changed return type or a break that comes
  from a dependency's types, so reviewers still check.

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

`.github/workflows/packages-ci.yml` runs these, the smoke checks and
`pnpm run check:packages` on Linux and macOS, on Node 22 and 24. On a pull
request it checks only the libraries the pull request changed and the ones
that depend on them. `.github/scripts/affected-packages.mjs` picks them, and
says which shared files make it check every library. path-guard also runs on
Windows. The `verify` jobs always report, so they are the checks to require.

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
also tests on the MSRV and with minimal dependency versions, and rebuilds
the `yaml-splice` wasm with `build.sh` and checks that it equals the one
committed in `packages/ts/yaml-splice/wasm/`. On a pull request it
checks that a breaking change bumps the version. Its `rust` job
is the one check to require.

```sh
cd packages/rust
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```
