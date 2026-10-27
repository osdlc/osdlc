# tradecraft binary release

The tooling that turns the `tradecraft` crate into prebuilt binaries and ships
them. [`.github/workflows/tradecraft-release.yml`](../../../../.github/workflows/tradecraft-release.yml)
runs it when release-plz pushes a `tradecraft/vX.Y.Z` tag.

| File | Is |
|---|---|
| `product.ts` | Every name and platform: package names, binary, targets, runners, tag prefix |
| `dist.ts` | The verbs the workflow and the smoke test run: build, notices, release-assets, assemble, pack, publish, formula, stage |
| `install.sh` | The curl installer attached to each release |
| `launcher.js` | The npm launcher template: finds the platform package and runs its binary |
| `templates/` | The launcher and platform `package.json` bases and READMEs |
| `about.toml` | cargo-about's accepted licenses and targets, for `THIRD_PARTY_NOTICES.md` |

The Homebrew formula is rendered by
[`scripts/homebrew-formula.ts`](../../../../scripts/homebrew-formula.ts), which
any osdlc CLI can use.

## What a release ships

- GitHub Release assets: `tradecraft-<version>-<rustc target>` for
  `aarch64-apple-darwin`, `x86_64-apple-darwin`, `aarch64-unknown-linux-musl`
  and `x86_64-unknown-linux-musl`, plus `SHA256SUMS`,
  `THIRD_PARTY_NOTICES.md`, the license files and `install.sh`. The Linux
  binaries are static musl builds. `cargo binstall tradecraft` reads the asset
  names from `[package.metadata.binstall]` in the crate's `Cargo.toml`.
- npm: `@osdlc/tradecraft` and `@osdlc/tradecraft-<os>-<cpu>`, at the crate
  version, by trusted publishing with provenance.
- Homebrew: `Formula/tradecraft.rb` in
  [osdlc/homebrew-tap](https://github.com/osdlc/homebrew-tap).

Windows is not built: the crate does not support it yet.

## Local use

```sh
node packages/rust/tradecraft/release/dist.ts smoke       # build, pack, install and run for this machine
node --test packages/rust/tradecraft/release/dist.test.ts # unit tests
```

## Releasing a tag by hand

For a tag that exists already, run the workflow from the Actions tab or:

```sh
gh workflow run tradecraft-release.yml --repo osdlc/osdlc -f tag=tradecraft/v0.3.5 -f dry_run=true
```

Check the run, then run it again with `dry_run=false`. A manual run builds the
Rust source of the tag with the tooling of the branch it runs on.

## First release on npm

npm can add a trusted publisher only to a package that exists, so before the
first publish the owner runs, logged in to npm as an owner of `@osdlc`:

```sh
node packages/rust/tradecraft/release/dist.ts stage --dry-run
node packages/rust/tradecraft/release/dist.ts stage
```

For each of the five packages it publishes a `0.0.1-stage` placeholder under
the `stage` tag, then adds a trusted publisher: repository `osdlc/osdlc`,
workflow `tradecraft-release.yml`, no environment. A step already done is
skipped.
