# npm checks

The checks for each row of the [quality bar](quality-bar.md) when the package is published to
npm. Commands and npm facts only; the rows and methods are explained in the files they link to.

## Setup

- Copy the package to scratch, with whatever it needs to build (for a workspace package, the
  workspace at the audited ref: `git archive <ref> | tar -x -C <scratch>` from the repository root).
  Build, pack and install only in the copy.
- Web requests use the User-Agent `lib-publish-ready-audit` and a timeout. Never put an email
  address or a person's name in a request header.
- Missing optional tools go on the report's "Tools not installed" line.
- Q2 Purpose, Q3 Prior art, Q7 Contract tests, Q21 Public decisions and Q24 Twin parity have no
  npm-specific check; read the package against the bar. For Q3, search
  `https://www.npmjs.com/search?q=<term>` for each main term.

## Gate evidence

### Stable

- The public API is what `exports` (or `main`) in `package.json` exposes, followed through
  the entry files' re-exports. Each subpath in `exports` is part of it, and so is each `bin`.
- These commands are the manual fallback until the sdlc CLI's `sdlc lib history` command lands.
- Old directories:
  `git log <ref> -S'<main export name>' --format='%h %ad %s' --date=short -- '*.ts'`. Search `--all`
  only when the ref finds nothing before the first commit. Add each old directory to `<old dirs>`.
- The commits, the entry files' renames, and the signature changes:

  ```sh
  git log <ref> --format='%h %ad %s' --date=short -- <package dir> <old dirs>
  git log <ref> --follow --format='%h %ad %s' --date=short -- <entry file>
  git log <ref> -G'^export ' --format='%h %ad %s' --date=short -- <package dir> <old dirs>
  ```

- Run `--follow` once per entry file named in `exports`, never on a directory or on boilerplate
  such as `LICENSE` or `tsconfig.json`, which it follows into other packages. Merge the lists
  and drop commits dated before the first commit of an entry file.
- A moved file with the same exports is not an API change. Behaviour changes need the commit
  messages from the first list read.

### Floor

- The highest published version of a name: `npm view <name> versions --json`. A 404 means
  never published, for a public package.
- Run it for the current name, for the same name under each earlier scope, and for each
  earlier package name. `npm view @<scope>/<name> versions --json` works for a public package of
  a scope you do not own. For the owner's own scopes, run it logged in as a member, since a
  restricted package also returns 404.
- An unpublished version still holds its number and is missing from `versions`. Read the keys of
  `npm view <name> time --json`, which keep unpublished versions (a package unpublished in full
  shows them under `time.unpublished.versions`). Check this against the registry.

### Home

- Consumers: `git grep -l '"<name>"' <ref> -- '*package.json'`. Cross-check with the import
  grep below, and report a package that declares the dependency but never imports it.
- Items used: `git grep -hE "(from|require\()[[:space:]]*['\"]<name>(/[^'\"]*)?['\"]" <ref>`, then
  read each import list.
- Co-change: for each commit in the first Stable list, `git show --stat --format= <sha>`, and
  count the commits that also changed a consumer.

## Rows

| Row | Check |
|---|---|
| Q1 Name | Search the exact name and its stem. `npm view <name>` and `npm view @<scope>/<name>`: a 404 means free. Check the scope belongs to the publishing account or organisation. npm refuses names too close to an existing one, so search `https://www.npmjs.com/search?q=<name>` too. |
| Q4 API surface | Every export in `exports` is intended. Each exported item has TSDoc. `tsc --noEmit` passes with the published `tsconfig`. |
| Q5 Stability tiers | Items that are not stable carry `@experimental` in TSDoc, the README lists them, and a test compares the list with the tags. |
| Q6 Functional tests | The test script runs under the runtime the package claims (Q11). Coverage is reported. |
| Q8 Usage tests | `examples/*.ts`, one or more per stable item, importing only the package name. `tsc --noEmit` covers them, and the test script runs them. README snippets are taken from those files. |
| Q9 Test reliability | Run the suite three times. A test that times a freshly built executable warms it up first; the first run is slow on macOS. |
| Q10 Docs | Read the README and the CHANGELOG against the row. |
| Q11 Runtimes | `engines.node` is set to the oldest supported line. The tests pass on that line and the newest. Check the workflow for a CI job on the oldest line. Run the tests locally on that line with `npx -y node@<line> …` or `mise exec node@<line> -- …` in the scratch copy; list Node under "Tools not installed" only if both fail. Another runtime is listed as also supported, with caveats, only if tests run on it. |
| Q12 Platforms | If no platforms are stated, grade owner and propose the list. `os` in `package.json` when the package refuses some platforms. Platform branches (`process.platform`) are documented or guarded. |
| Q14 Package metadata | `description`, `license`, `repository`, `homepage`, `bugs`, `keywords`. Each URL returns 200 to an unauthenticated `curl -s -m 20 -o /dev/null -w '%{http_code}' -L <url>`; a logged-in client can see a private repo the public cannot. |
| Q15 Independence | Grep the tarball's files for the source repo's names, ids and paths. |
| Q16 Licence | The `license` field holds the SPDX expression; `SEE LICENSE IN <file>` marks a custom licence. Check the licence files named by the expression are in the `npm pack` file list (for `MIT OR Apache-2.0`: `LICENSE-MIT` and `LICENSE-APACHE`, or one `LICENSE` holding both texts). Grep for copied code (copyright headers, "adapted from"). |
| Q17 Security | `npm audit --omit=dev` in the clean consumer from Q13; its install creates the lockfile the audit needs. Review shell-outs, temp files and file permissions. |
| Q18 Versioning | Semver with 0.x rules. From the second release on, compare the published `.d.ts` with the new one (an API report tool, if installed). |
| Q19 Changelog release entry | `grep -nE '^## \[?[0-9]' CHANGELOG.md` for the headings, Keep a Changelog or Changesets; `git tag --list '*<version>*'` for each version. |
| Q20 Community | `CONTRIBUTING.md` and `SECURITY.md` in the package or its repo. |
| Q23 Unsafe code | n/a: TypeScript and JavaScript have no unsafe escape hatch to forbid. If the package ships a native addon or wasm built from code that has one, check the source language's rule (for Rust, the Q23 checks in [rust](rust.md)). |

## Q13 Package contents

- If the release pipeline rewrites the manifest before packing, audit the rewritten one.
- Build, then `npm pack --pack-destination <scratch>`. Read the file list: `files` ships only
  what consumers need.
- `publint run <tarball> --strict`.
- `attw <tarball> --profile esm-only` for an ESM-only package, `--profile node16` otherwise.
- Install the tarball in an empty project and `import()` every entry point under Node. This
  catches an `exports` condition that points Node at a `.ts` file, which Node refuses to
  strip under `node_modules`. publint and attw do not catch it.

## Q22 Publish path

- Check whether the publish workflow builds and keeps a tarball for a package not yet on npm,
  or refuses it before the build. A refusal leaves only the home's placeholder route.
- npm cannot trust CI for a package that does not exist yet, and today it needs a person for
  the publish (a passkey). A person uploads the verified tarball the workflow built:
  `npm publish ./<tarball>.tgz --access public`. With a passkey as the second factor, npm opens
  a browser approval; no token or one-time code.
- Write the tarball path with `./` or `/`: npm reads a bare `dir/x.tgz` as GitHub shorthand.
- npm's staged publishing can add its own stub version `0.0.0-stage` (a two-file placeholder).
  Do not rely on it. A home's placeholder route publishes a real build under a pre-release tag
  instead. After the real publish, check `npm view <name> dist-tags`: `latest` is the real
  version.
- Add the trusted publisher right after the first publish; every later release publishes
  from the workflow with provenance.
- An unpublish is refused once another package depends on the package.
