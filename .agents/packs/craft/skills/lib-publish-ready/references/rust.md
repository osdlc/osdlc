# Rust and crates.io checks

The checks for each row of the [quality bar](quality-bar.md) when the package is a crate
published to crates.io. Commands are one per line and use `env VAR=value` so they run in any
shell.

## Setup

Inputs: the ref to audit (`<ref>`, for example `origin/main`), the crate directory, the
owner accounts on the code host, and whether `<ref>` is the release commit for a version.

1. Find the path dependencies. For each dependency of the crate, and in turn of each path
   dependency found:
   - if its entry has `path =`, take that path;
   - if its entry is `workspace = true`, look the name up in the root
     `[workspace.dependencies]` and take that entry's `path =`, if it has one;
   - otherwise it comes from the registry; skip it.

   Root entries that nothing in this list uses are ignored. Each path found goes in the copy.
2. Archive the crate, its path dependencies and the workspace root files at `<ref>`. Name only the
   root files that exist (`git archive` fails on a missing path):

   ```sh
   git archive <ref> <crate dir> <path dep dirs> Cargo.toml Cargo.lock rust-toolchain.toml clippy.toml .cargo | tar -x -C <scratch>
   ```

3. In the copy's root `Cargo.toml`, set `[workspace] members` to the crate and its path
   dependencies, and delete `exclude` and `default-members`. A member glob that matches nothing in
   the copy, or names a directory that is not there, stops every cargo command. From `<scratch>`:

   ```sh
   python3 -c 'import re,sys;p=sys.argv[1];m=sys.argv[2:];s=open(p).read();s=re.sub(r"(?ms)^members\s*=\s*\[.*?\]","members = ["+", ".join(chr(34)+x+chr(34) for x in m)+"]",s,count=1);s=re.sub(r"(?ms)^(exclude|default-members)\s*=\s*\[.*?\]\n","",s);open(p,"w").write(s)' Cargo.toml <crate dir> <path dep dirs>
   ```

4. Set `CARGO_TARGET_DIR` to a folder inside `<scratch>`. The copied `rust-toolchain.toml` pins a
   toolchain; if that one is not installed (`rustup toolchain list`), set `RUSTUP_TOOLCHAIN` to an
   installed one so rustup does not download it. Record the toolchain used in the report. Run every
   cargo command in the copy with `-p <crate>`. cargo can create or update `Cargo.lock`, so it never
   runs in the real workspace. The copy's lockfile may change when cargo prunes it; that is
   expected.
5. Read the target home's release workflow and config (release-plz settings, publish flags,
   manifest rewrites). Run the same package command it runs, in the copy, and record the
   command and any difference from the workflow in the report's `Artifact audited:` line. If
   the home has no workflow yet, pack with plain `cargo package -p <crate>` and record that.
   The command writes the packaged crate to
   `$CARGO_TARGET_DIR/package/<crate>-<version>`. The checks below call that directory "the
   packaged crate".

Notes:

- Optional tools are marked "if installed". When one is missing, check the row by reading,
  and list the tool on the report's "Tools not installed" line.
- Web requests use the User-Agent `lib-publish-ready-audit`. Never put an email address or a
  person's name in a request header. Wait one second between crates.io API calls, and give
  each `curl` a timeout (`-m 20`).
- Q2 Purpose and Q24 Twin parity need no crate-specific check; read the README and the twin
  against the bar. crates.io shows
  the `readme` file, and docs.rs shows the crate-root docs, so read both.

## Gate evidence

### Stable

- These commands are the manual fallback until the sdlc CLI's `sdlc lib history` command lands.
- Old directories:
  `git log <ref> -S'<public item name>' --format='%h %ad %s' --date=short -- '*.rs'`. Search `--all`
  only when the ref finds nothing before the first commit. Add each old directory to `<old dirs>`.
- The commits, the crate root's renames, and the signature changes:

  ```sh
  git log <ref> --format='%h %ad %s' --date=short -- <crate dir> <old dirs>
  git log <ref> --follow --format='%h %ad %s' --date=short -- <crate dir>/src/lib.rs
  git log <ref> -G'^[[:space:]]*pub (fn|enum|struct|trait|type|const|mod)' --format='%h %ad %s' --date=short -- <crate dir>/src <old dirs>
  ```

- Run `--follow` on single source files only, never on a directory or on boilerplate such as
  `LICENSE`, which it follows into other crates. Drop commits dated before the crate root's
  first commit.
- A rename commit with no line changes is not an API change. Behaviour changes need the commit
  messages from the first list read.
- The public API for the [version replay](version-replay.md) is every `pub` item reachable
  from `src/lib.rs`, followed through `pub use` re-exports. `cargo public-api -p <crate>` (if
  installed) lists it.

### Floor

- Run Q1's exact query for the current name and each earlier crate name. Take the highest of
  `versions[].num` by semver, yanked included, since a yanked version keeps its number. "does not
  exist" means never published.

### Home

- Consumers: `git grep -lE '^<crate>[[:space:]]*=' <ref> -- '*Cargo.toml'`, plus workspace entries
  that use `<crate>.workspace = true`.
- Items used: `git grep -ohE '<crate_ident>::[A-Za-z_]+' | sort | uniq -c | sort -rn`, where
  `<crate_ident>` is the name with `_` for `-`. This undercounts items imported with
  `use <crate_ident>::{...}` lists or renamed with `as`; read those imports too.
- Co-change: for each commit in the first Stable list, `git show --stat --format= <sha>`, and
  count the commits that also changed a consumer.

## Name, prior art and metadata

### Q1 Name

- Exact: `curl -s -m 20 -A lib-publish-ready-audit https://crates.io/api/v1/crates/<name>`.
  "does not exist" means free. crates.io ignores case and treats `-` and `_` as the same, so
  check both spellings.
- Name rules: ASCII letters, digits, `-` and `_`; starts with a letter; at most 64
  characters. crates.io reserves some names, such as `std`, `core` and Windows device names
  like `nul`.
- Overlaps: search the exact name and its stem (for `etag-write`, also `etag`). An exact search can
  return nothing while the stem returns the near names:

  ```sh
  curl -s -m 20 -A lib-publish-ready-audit 'https://crates.io/api/v1/crates?q=<term>&sort=relevance&per_page=20'
  ```

  Read `.crates[].name`, `.description`, `.downloads` and `.updated_at`.
- lib.rs ranks by relevance; read the first 20 crate links in order:

  ```sh
  curl -s -m 20 -A lib-publish-ready-audit 'https://lib.rs/search?q=<term>' | grep -oE 'href="/crates/[a-z0-9_-]+"' | awk '!seen[$0]++' | head -20
  ```

- Look at the crates in the same categories (`https://crates.io/categories/<slug>`) and
  well-known Rust projects for names that look or sound like this one.
- docs.rs: `https://docs.rs/<name>`. Code host: `gh api repos/<owner>/<name>` and
  `gh api users/<name>`.

### Q3 Prior art

- The crates.io search and lib.rs commands from Q1, once per main term of the crate's
  purpose (for example `atomic write`, `compare and swap`). Use `sort=relevance`: a
  free-text search sorted by downloads returns popular unrelated crates.
- crates.io keyword pages: `https://crates.io/api/v1/crates?keyword=<keyword>&sort=relevance`.
- blessed.rs: list each recommended crate with its section, then read the sections that match the
  crate's purpose. A purpose with no matching section means no entry.

  ```sh
  curl -s -m 20 -A lib-publish-ready-audit https://blessed.rs/crates | grep -oE 'id="section-[a-z0-9-]+"|href="https://lib.rs/crates/[a-z0-9_-]+"' | awk -F'"' '/^id=/{sec=$2; next} {sub("https://lib.rs/crates/","",$2); print sec, $2}' | awk '!seen[$0]++'
  ```

- Inside: the owner's accounts, as given in the inputs. `gh repo list` shows one owner at a
  time, so run it for each: `gh api user --jq .login`, `gh api user/orgs --jq '.[].login'`,
  then `gh repo list <owner> --limit 200` and `gh search code --owner <owner> '<term>'` for
  each owner.
- Record downloads and the last release date for each hit; a large crate last released years
  ago is still prior art.

### Q14 Package metadata

- `Cargo.toml` has `description`, `license`, `repository` and `readme` (or a `README.md`
  beside it).
- `keywords`: at most 5, each at most 20 characters.
- `categories`: slugs from `https://crates.io/category_slugs`.
- `documentation` is optional; docs.rs is the default. `homepage` only if it differs from
  `repository`.
- Each URL returns 200 to an unauthenticated
  `curl -s -m 20 -o /dev/null -w '%{http_code}' -L <url>`. crates.io keeps each version's metadata
  as published.

### Q16 Licence

- The `license` field holds the SPDX expression. A crate that uses `license-file` instead
  has a custom licence, unless the file holds the standard text for an SPDX id.
- For `MIT OR Apache-2.0`, the files are `LICENSE-MIT` and `LICENSE-APACHE`; check that they
  appear in `cargo package --list`.
- Copied code: grep for copyright headers and "adapted from" or "based on" comments; each has
  compatible terms and attribution.

## API and stability

### Q4 API surface

- Docs, with `missing_docs`; exits 0 with no warnings:

  ```sh
  env RUSTDOCFLAGS='-D warnings -W missing_docs' cargo doc --no-deps -p <crate>
  ```

- Clippy:

  ```sh
  cargo clippy -p <crate> --all-targets -- -D warnings -W clippy::missing_errors_doc -W clippy::missing_panics_doc
  ```

- A public error enum or options struct that may grow is `#[non_exhaustive]`.
- `cargo public-api -p <crate>` (if installed) lists the surface; read it for helpers that
  should be private.
- Features: default features are the smallest useful set, features are additive, optional
  dependencies use `dep:` so they do not become features by accident, and no feature is named
  after an internal consumer.

### Q5 Stability tiers

- Items that are not stable sit behind an `unstable` feature or carry a doc note, and the
  README lists them.
- A test or doc check compares the list with the items.

### Q18 Versioning

- In 0.x, cargo treats a 0.y bump as breaking and 0.y.z as compatible; the CHANGELOG follows
  that.
- From the second release on: `cargo semver-checks check-release -p <crate>` (if installed)
  against the published version. On a first release it fails with "not found in registry";
  record n/a.

## Tests and docs

### Q6 Functional tests

- `cargo test -p <crate>`.
- Coverage: `cargo llvm-cov -p <crate>` (if installed). If the tool is missing, grade gap
  unless a coverage figure is reported in the README or CI.

### Q7 Contract tests

- Each claim in the README and the crate docs maps to a named test.

### Q8 Usage tests

- A doc-test on each public item, and `examples/` for longer flows. Both use only `<crate>::`
  paths.
- Unit tests inside the crate (`#[cfg(test)]` modules) do not count: they can use private
  items.
- `cargo test -p <crate> --doc` runs more than zero tests.
- The README runs as a doc-test when the crate root has `#![doc = include_str!("../README.md")]`.

### Q9 Test reliability

- Run `cargo test -p <crate>` three times.
- Grep the tests for `Instant::now`, `sleep` and timeouts; each has a margin or a warm-up.

### Q10 Docs

- The crate root has crate docs.
- `cargo doc` builds with the features docs.rs will use. Set `[package.metadata.docs.rs]`
  (for example `all-features = true`) when the crate has features.
- The README covers install (`cargo add <crate>`) and a quick start.

## Runtimes and platforms

### Q11 Runtimes

- `rust-version` is set in the crate's own `Cargo.toml`, or inherited with
  `rust-version.workspace = true`. A workspace value is not inherited on its own.
- It is at least the edition's floor: edition 2024 needs 1.85, edition 2021 needs 1.56.
- If `rust-version` is unset, grade gap. Use as the floor the higher of the edition floor and
  the highest `rust-version` among the dependencies, and propose it in the fix list.
- Pass needs a CI job on the floor version: check the workflow for the exact floor toolchain,
  a fresh resolve and the tests. No such job is a gap.
- The audit's own check is local: delete `Cargo.lock` in the packaged crate, then run
  `cargo +<floor> test` there, so the floor toolchain also resolves the lockfile.
  `cargo +<version>` overrides `RUSTUP_TOOLCHAIN`. `cargo msrv` is optional.
- If the floor toolchain is not installed, record the row as "unverified on <floor>", say
  which toolchain it did pass on, and do not install one. Install it only when the caller
  allows it, with `rustup toolchain install --profile minimal <floor>`, and say so in the
  report.
- Lower dependency bounds, in the packaged crate:

  ```sh
  cargo +nightly update -Z direct-minimal-versions
  cargo +nightly test
  ```

  Use `direct-minimal-versions` rather than `minimal-versions`: it lowers only this crate's
  own dependencies, which are the bounds the crate states. Transitive crates often have wrong
  lower bounds of their own, which the crate cannot fix.

### Q12 Platforms

- If no platforms are stated, grade owner and propose the list in an owner question; the
  README statement is a fix item under Q12. Skip the `--target` check below.
- Grep for `cfg(unix)`, `cfg(windows)` and `cfg(target_os`. Each platform-specific path is
  documented or guarded.
- `cargo check -p <crate> --target <triple>` for each stated platform whose standard library
  is installed (`rustup target list --installed`). A stated platform with no installed target
  is "unverified".
- CI runs the tests on each stated platform.

## Package

### Q13 Package contents

- `cargo package --list -p <crate>`: only source, licences, README, CHANGELOG and files the
  build needs. Repo-only files (build-tool configs, CI files) are left out with `exclude` or
  `include`.
- `cargo publish --dry-run -p <crate>` passes. It builds the packaged crate on its own, and
  fails on a path or git dependency with no registry version.
- A sibling crate that is not yet on crates.io makes that dry run fail. Use
  `cargo publish --workspace --dry-run` (cargo 1.90 and later), or record the failure as
  expected and name the sibling that publishes first.
- Every other dependency is on crates.io at the stated version.
- Build and test the packaged crate outside the workspace.
- The `.crate` file is under 10 MB.
- `cargo hack check -p <crate> --each-feature --no-dev-deps` (if installed) checks each
  feature on its own.

### Q15 Independence

- Grep the packaged crate for the source repo's names: the repo name, app and crate names,
  internal id patterns, paths, tool names.
- Check temp-file prefixes, error text and log text too, since users see them.
- Check links in the CHANGELOG and README: a link into a private repo fails for users
  (`gh api repos/<owner>/<repo> --jq .visibility`).
- Read the packaged `Cargo.toml`: workspace settings (`[lints] workspace = true`,
  `.workspace = true` fields) are resolved into it.

### Q17 Security

- Run `cargo generate-lockfile` in the packaged crate, then `cargo audit` or
  `cargo deny check advisories` (if installed). Both need a lockfile.
- Review temp-file creation (exclusive create, same directory), the permissions of written
  files, and paths built from input.

## Release

### Q19 Changelog release entry

- Read the headings: `grep -nE '^## \[?[0-9]' CHANGELOG.md`.
- List the release tags: `git tag --list '*<version>*'` for each dated version.

### Q20 Community and Q21 Public decisions

- `CONTRIBUTING.md` and `SECURITY.md` in the crate or its repo.
- Q21: read the decision notes where the `decisions` step in [process](process.md) puts them.

### Q22 Publish path

- Read the target home's release setup: `.github/workflows/`, its tag grammar, and its
  licence. Confirm it has a cargo build, test and publish lane and that its tag grammar
  covers Rust crates. List what is missing.
- If the target home does not exist yet or is not a Cargo workspace, grade blocker and name
  what it needs.
- crates.io trusted publishing (GitHub Actions OIDC) can only be added once the crate exists.
  The first publish of a crate goes through the release workflow with a crates.io token held
  as a secret in a protected environment (required reviewer, main only). The token has the
  endpoint scope `publish-new` and a crate scope of the names not yet published. One token
  can cover several new crates. `publish-new` covers only each name's first version. After the
  publish, add a trusted publisher for each crate and hold no token.
- The same workflow uses the token the first time and trusted publishing after. release-plz
  does the OIDC exchange itself when no token is set. A run must not mix new and existing
  crates. When several crates publish together, check the current crates.io new-crate rate
  limit. Check that the home has the protected environment.
- Sibling crates publish in dependency order; `cargo publish --workspace` does that on cargo
  1.90 and later.
- A published version cannot be overwritten. `cargo yank` hides it from new resolution.
- Before a yank or a deletion, read the current crates.io policy (<https://crates.io/policies>
  and the crates.io docs on deleting a crate) and record the page and the date read. This
  file gives no numbers.

### Q23 Unsafe code

- Required by default: `#![forbid(unsafe_code)]` at the crate root, or
  `[workspace.lints.rust] unsafe_code = "forbid"` with `[lints] workspace = true` in the
  crate. Check the packaged `Cargo.toml` too, since lints are resolved into it.
- A crate that needs `unsafe` uses `deny` instead, with `#[allow(unsafe_code)]` and a
  `// SAFETY:` comment at each use. Grep every `unsafe` and check each has the comment. That
  case gets the owner verdict: the owner accepts each use.
- Neither in place: gap.
