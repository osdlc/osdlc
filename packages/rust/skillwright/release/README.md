# skillwright binary release

The tooling that turns the `skillwright` crate into prebuilt binaries and ships
them. [`.github/workflows/skillwright-release.yml`](../../../../.github/workflows/skillwright-release.yml)
runs it when release-plz pushes a `skillwright/vX.Y.Z` tag.

| File | Is |
|---|---|
| `product.ts` | Every name and platform: package names, binary, targets, runners, tag prefix |
| `dist.ts` | The verbs the workflow and the smoke test run: build, notices, release-assets, from-release, assemble, pack, publish, formula, stage |
| `install.sh` | The curl installer attached to each release |
| `launcher.js` | The npm launcher template: finds the platform package and runs its binary |
| `templates/` | The launcher and platform `package.json` bases and READMEs |
| `about.toml` | cargo-about's accepted licenses and targets, for `THIRD_PARTY_NOTICES.md` |

The Homebrew formula is rendered by
[`scripts/homebrew-formula.ts`](../../../../scripts/homebrew-formula.ts), which
any osdlc CLI can use.

## What a release ships

- GitHub Release assets: `skillwright-<version>-<rustc target>` for
  `aarch64-apple-darwin`, `x86_64-apple-darwin`, `aarch64-unknown-linux-musl`
  and `x86_64-unknown-linux-musl`, plus `SHA256SUMS`,
  `THIRD_PARTY_NOTICES.md`, the license files and `install.sh`. The Linux
  binaries are static musl builds. `cargo binstall skillwright` reads the asset
  names from `[package.metadata.binstall]` in the crate's `Cargo.toml`.
- npm: `@osdlc/skillwright` and `@osdlc/skillwright-<os>-<cpu>`, at the crate
  version, by trusted publishing with provenance.
- Homebrew: `Formula/skillwright.rb` in
  [osdlc/homebrew-tap](https://github.com/osdlc/homebrew-tap).

Windows is not built: the crate does not support it yet.

## Local use

```sh
node packages/rust/skillwright/release/dist.ts smoke       # build, pack, install and run for this machine
node --test packages/rust/skillwright/release/dist.test.ts # unit tests
```

## Re-running a release

Run the workflow from main, from the Actions tab or:

```sh
gh workflow run skillwright-release.yml --repo osdlc/osdlc --ref main -f tag=skillwright/v0.3.7 -f dry_run=true
```

A manual run refuses any ref but main, and builds the tag's own source and
tooling. Published assets are never replaced: once a release has its
`SHA256SUMS`, a run reuses its binaries instead of building, so npm and
Homebrew get the same bytes. An older version never moves npm `latest` or
the tap backwards, and a pre-release goes to npm `next` only.

## First release on npm

npm can add a trusted publisher only to a package that exists, so before the
first publish the owner runs, logged in to npm as an owner of `@osdlc`:

```sh
node packages/rust/skillwright/release/dist.ts stage --dry-run
node packages/rust/skillwright/release/dist.ts stage
```

It hands placeholder packages to `scripts/stage-npm-package.ts`. For each of
the five packages that script publishes a `0.0.1-stage` placeholder under the
`stage` tag, then adds a trusted publisher: repository `osdlc/osdlc`, workflow
`skillwright-release.yml`, environment `npm`. A step already done is skipped.
