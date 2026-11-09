# @osdlc/package-checks

Checks for a repository of TypeScript packages and Rust crates, as
osdlc/osdlc keeps them:

- **`ts`** packs each TypeScript package the way it will be published and
  checks the tarball: the package shape, publint, Are The Types Wrong, and a
  clean consumer that installs the tarball, loads every entry point and runs
  the package's smoke check.
- **`rust`** checks the shape of every crate in the Cargo workspace.
- **`semver`** checks that a breaking change to a crate on crates.io also sets
  its new version.
- **`affected`** picks the packages a pull request changed, plus the ones that
  depend on them, for CI.
- **`stage`** publishes a new package's placeholder to npm and adds its
  trusted publisher, which CI needs before it can publish the package.
- **`config <key>`** prints one setting from `package-checks.json`, with the
  default filled in, for a workflow step that needs it.

The rules are the standards
[S-package-shape-ts](https://github.com/osdlc/osdlc/blob/main/docs/planning/standards/S-package-shape-ts.md)
and
[S-package-shape-rs](https://github.com/osdlc/osdlc/blob/main/docs/planning/standards/S-package-shape-rs.md).
A repository changes the parts that differ in `package-checks.json`.

## Install

```sh
npm install --save-dev @osdlc/package-checks
# or
pnpm add -D @osdlc/package-checks
```

Node 22 or later. ESM only. publint and Are The Types Wrong come with the
package. `ts` needs pnpm, npm and tar on the PATH; `rust` needs nothing else;
`semver` needs cargo and
[cargo-semver-checks](https://github.com/obi1kenobi/cargo-semver-checks);
`stage` needs pnpm, npm (it runs a pinned npm through `npx`) and an npm
login.

## The layout it reads

```
package.json, pnpm-workspace.yaml   a pnpm workspace; its catalog is read
package-checks.json                 optional settings (below)
.oxlintrc.json                      the one lint config every package uses
packages/ts/<name>/                 one TypeScript package each
packages/rust/Cargo.toml            the Cargo workspace; its members are checked
packages/conformance/families.json  library families, read by `affected`
```

## The command

Run each command at the repository root.

```sh
pnpm run build                              # ts packs dist/, so build first
package-checks ts                           # every package
package-checks ts packages/ts/a packages/ts/b
package-checks rust
package-checks semver packages/rust/Cargo.toml HEAD^1
EVENT=pull_request package-checks affected HEAD^1 HEAD
package-checks stage --dry-run packages/ts/new-lib
```

- `ts` checks the packages named, or all of them. It packs every package
  first, so a package's workspace dependencies install from local tarballs in
  the clean consumer, not from npm.
- `semver` runs `cargo semver-checks` on each crate that is on crates.io and
  changed since the base revision, and fails naming the version to set. It
  writes a table to `$GITHUB_STEP_SUMMARY` when that is set.
- `affected` reads `EVENT`. On `pull_request` it picks from the diff;
  otherwise it picks every package. It prints `packages`, `filter`, `build`
  and `dirs`, and appends them to `$GITHUB_OUTPUT` when that is set.
- `stage` publishes `0.0.1-stage` under the `stage` tag and runs
  `npm trust github` with the repository from the package's `repository.url`
  and `--workflow` (default `packages-publish.yml`). A step already done is
  skipped.

The exit code is 0 when everything passes, 1 on a problem, and 2 on a bad
command line.

## Settings

`package-checks.json` at the repository root is optional. Every key is
optional; the defaults are osdlc's rules (`OSDLC`).

```json
{
  "configPackages": ["tsconfig", "prettier-config"],
  "shared": ["^\\.github/workflows/packages-ci\\.yml$"],
  "rustTwinNames": { "gfm-pipe-table": "gfm-table" }
}
```

| Key              | Default                              | What it sets                                                          |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `license`        | `MIT OR Apache-2.0`                  | The licence every package declares and its README names               |
| `licenseFiles`   | `["LICENSE-MIT", "LICENSE-APACHE"]`  | The licence files every package keeps and its README links            |
| `author`         | `sksizer`                            | The `author` every package.json names; `null` for no rule             |
| `baseEngine`     | `>=22`                               | The widest `engines.node` a package may declare                       |
| `tsDir`          | `packages/ts`                        | The TypeScript packages' folder                                       |
| `configPackages` | `[]`                                 | Packages that ship config and no code, by folder name                 |
| `catalog`        | `true`                               | A dependency the pnpm catalog pins must be written `catalog:`         |
| `rootLintConfig` | `.oxlintrc.json`                     | The root lint config; a package may not keep its own. `null`: no rule |
| `rustWorkspace`  | `packages/rust`                      | The Cargo workspace folder                                            |
| `families`       | `packages/conformance/families.json` | The conformance registry `affected` reads                             |
| `shared`         | `[]`                                 | More path patterns that make `affected` pick every package            |
| `rustTwinNames`  | `{}`                                 | A crate whose TypeScript twin has another folder name                 |
| `scope`          | `@osdlc`                             | The npm scope `stage` accepts; `null` for any                         |

## From code

```ts
import { checkTsPackages, loadConfig, pick, readWorkspace, shapeTs } from '@osdlc/package-checks'

const root = process.cwd()
const settings = loadConfig(root)
process.exitCode = checkTsPackages(root, [], settings)

// The checks are functions over data.
shapeTs.readmeProblems('@acme/lib', '# @acme/lib\n')

// The packages a change touches, and their dependents.
pick({ event: 'pull_request', files: ['packages/ts/lib/a.ts'], manifests: readWorkspace(root, settings), settings })
```

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
