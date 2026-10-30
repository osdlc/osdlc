# S-package-shape-rs: Package shape, Rust

## Purpose

Every Rust crate under `packages/rust/` has the same shape, so the crates
publish to crates.io the same way and a shared change reaches all of them from
the workspace. This standard says what that shape is.

## Rule

A crate is a member of the Cargo workspace in `packages/rust/Cargo.toml`, and
only crates listed in its `members` are checked. A
published crate (the default) keeps all of these:

- **Shared fields from the workspace.** `edition`, `rust-version`, `license`
  and `repository` are written `<key>.workspace = true`, and the crate sets
  `[lints] workspace = true`. The workspace holds the values, so the MSRV and
  the lints change in one place.
- **Name and description.** `name` is the directory name. `description` is not
  empty.
- **Discoverable on crates.io.** `readme = "README.md"`, and `keywords` (at
  most five, the crates.io limit) and `categories` are not empty.
- **A package list that ships the docs.** `include` has an entry under `src/`
  (such as `src/**/*.rs`), and lists `README.md`, `CHANGELOG.md`, `LICENSE-MIT`
  and `LICENSE-APACHE`. It may list more, such as tests and fixtures. `cargo
  package` in CI builds the crate from that list.
- **The same files.** The crate directory holds `README.md`, `CHANGELOG.md`,
  `LICENSE-MIT`, `LICENSE-APACHE`, `src/` and `examples/`.
- **The same README and CHANGELOG.** `README.md` starts `# <name>`, has an
  `## Install` section that shows `cargo add <name>`, and a `## License`
  section that names MIT and Apache. `CHANGELOG.md` starts `# Changelog`, as
  release-plz writes it.

A crate with `publish = false` is not on crates.io. It keeps the code-health
subset: the workspace fields and `[lints]`, `name`, `description`, the two
licence files and `src/`. It needs no README, CHANGELOG, examples, keywords,
categories or `include`.

## Enforcement

`scripts/package-shape-rs.ts` holds the checks, as functions over data that
its entry point reads from `packages/rust/`. It takes the crate list from
`members` in `packages/rust/Cargo.toml`. `scripts/package-shape-rs.test.ts`
tests the checks and runs them over every crate in the repository.

```sh
pnpm run check:crates
```

CI runs the tests and the check in the `lint` job of
`.github/workflows/rust-ci.yml`. The job also runs when a change touches
`scripts/package-shape-rs*`.

## Exemptions

One crate has `publish = false` and keeps only the code-health subset
above:

- `yaml-splice-wasm`, the build input for the `yaml-splice` npm package.

No other crate is exempt.
