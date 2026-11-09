# ts-packages

Not an action. Two reusable workflows check and release a pnpm workspace of
TypeScript packages the way osdlc/osdlc does. GitHub only runs a reusable
workflow from `.github/workflows/`, so the files live there; this folder holds
their documentation and changelog, so a `gh-actions` release covers them.

| Workflow                                                                        | What it does                                                                                   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`ts-packages-ci.yml`](../../../.github/workflows/ts-packages-ci.yml)           | Picks the changed packages, checks the conformance suites, and runs the `verify` matrix.       |
| [`ts-packages-release.yml`](../../../.github/workflows/ts-packages-release.yml) | Opens the Changesets Version Packages pull request, or publishes to npm by trusted publishing. |

The checks themselves are two npm packages, which the calling repository
installs as root devDependencies, so its lockfile pins their versions:

- [`@osdlc/package-checks`](../../ts/package-checks/): `package-checks
affected` picks the packages, and `package-checks ts` packs them and runs
  publint and attw.
- [`@osdlc/conformance`](../../ts/conformance/): `conformance check` checks
  the suites, and `--regenerate` reruns their generators.

osdlc/osdlc calls both workflows from its own `packages-ci.yml` and
`packages-publish.yml`.

## What a repository needs

- A pnpm workspace with the packages in `packages/ts/<name>/`, each in the
  [package shape](../../../docs/planning/standards/S-package-shape-ts.md).
  `package-checks ts` checks the shape, and the root `package-checks.json`
  sets this repository's rules over osdlc's defaults (see the
  package-checks README).
- Root devDependencies `@osdlc/package-checks`, `@changesets/cli` and, with
  conformance suites, `@osdlc/conformance`.
- With conformance suites: `packages/conformance/families.json`, and
  optionally `packages/conformance/config.json`. Without them, pass
  `conformance: false`.
- For the release: a `.changeset/config.json`, and a root `version-packages`
  script that runs `changeset version` and then anything that must follow,
  such as `conformance write --reference ts`.
- For the release: a GitHub App installed on the repository with contents
  and pull-requests write, its client ID, and an environment (by default
  `release-plz`) that holds its private key as `RELEASE_PLZ_APP_PRIVATE_KEY`.
  osdlc/osdlc uses the osdlc-release App.
- For the release: each package on npm, with a trusted publisher that names
  the calling workflow (below). A new package is staged once by the owner
  with `package-checks stage`.

## CI

`.github/workflows/packages-ci.yml` in the calling repository:

```yaml
name: packages

on:
  pull_request:
  workflow_call:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.run_id }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  packages:
    uses: osdlc/osdlc/.github/workflows/ts-packages-ci.yml@<commit-sha> # gh-actions/v1
```

The checks report as `packages / changes` and
`packages / verify (<os>, node <n>)`: GitHub names a called job
`<calling job> / <job>`. A ruleset requires the `verify` ones by those names.
They always run and report; only their steps narrow.

| Input           | Default                             | Meaning                                                                                        |
| --------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `os`            | `["ubuntu-latest", "macos-latest"]` | JSON array of runner labels for the `verify` matrix.                                           |
| `node`          | `["22", "24"]`                      | JSON array of Node versions for the `verify` matrix.                                           |
| `main-node`     | `24`                                | The Node that also runs the tarball checks, and on the first OS the conformance regeneration.  |
| `conformance`   | `true`                              | Check and regenerate the conformance suites.                                                   |
| `tooling-build` | empty                               | Shell run before `package-checks` or `conformance` is used, for a repository that builds them. |
| `repo-checks`   | empty                               | Shell run in `changes`, for checks of the repository itself.                                   |

Outputs, for jobs of the caller's own that run on the picked packages:
`packages` (JSON array of folders), `filter` and `build` (pnpm `--filter`
flags, `build` with the workspace dependencies), and `dirs` (space-separated).

## Release

`.github/workflows/packages-publish.yml` in the calling repository. Each
package's trusted publisher on npmjs.com names this file, so keep its name:

```yaml
name: packages-publish

on:
  push:
    branches: [main]

permissions: {}

concurrency:
  group: packages-publish-${{ github.ref }}
  cancel-in-progress: false

jobs:
  verify:
    permissions:
      contents: read
    uses: ./.github/workflows/packages-ci.yml

  release:
    needs: verify
    permissions:
      contents: write
      id-token: write
    uses: osdlc/osdlc/.github/workflows/ts-packages-release.yml@<commit-sha> # gh-actions/v1
    with:
      app-client-id: <the App's client ID>
```

npm checks the workflow that starts the run, not the reusable workflow that
runs `npm publish`, and both need `id-token: write`
([npm docs](https://docs.npmjs.com/trusted-publishers), Troubleshooting).
So the trusted publisher is: repository `<owner>/<repo>`, workflow
`packages-publish.yml`, no environment. `package-checks stage` sets this up
by default.

| Input             | Default                     | Meaning                                                            |
| ----------------- | --------------------------- | ------------------------------------------------------------------ |
| `app-client-id`   | required                    | Client ID of the App that opens the Version Packages pull request. |
| `environment`     | `release-plz`               | The environment that holds `RELEASE_PLZ_APP_PRIVATE_KEY`.          |
| `version-prepare` | empty                       | Shell run after the install, before `version-script`.              |
| `version-script`  | `pnpm run version-packages` | One command, run without a shell, that versions the packages.      |
| `packages-dir`    | `packages/ts`               | The folder whose packages must already be on npm.                  |
| `npm-version`     | `11.19.1`                   | The npm that publishes. Trusted publishing needs 11.5.1 or later.  |

The pack job refuses to go on while any package is not on npm yet, and names
it.

## Versioning

The workflows share the `gh-actions` version with the actions in this
directory: a release tags `gh-actions/vX.Y.Z` and moves `gh-actions/vX`
(see [the gh-actions README](../README.md#versioning)). Pin the commit SHA and
name the tag in a comment. The workflows and the two npm packages version
apart: the workflows call whatever `package-checks` and `conformance` the
caller's lockfile holds.

## Licence

`MIT OR Apache-2.0`.
