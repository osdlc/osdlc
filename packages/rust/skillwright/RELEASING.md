# Releasing skillwright

How a `skillwright` version gets from a merged change to every install
channel. It names settings and secrets, never their values.

The tooling itself is described in [`release/README.md`](release/README.md).

## Channels

| Channel | Install | Published by |
|---|---|---|
| crates.io | `cargo install skillwright` | `release-plz.yml`, job `release` |
| GitHub Release | `install.sh`, direct download | `skillwright-release.yml`, job `release` |
| npm | `npm i -g @osdlc/skillwright` | `skillwright-release.yml`, job `npm` |
| Homebrew | `brew install osdlc/tap/skillwright` | `skillwright-release.yml`, job `homebrew` |
| cargo-binstall | `cargo binstall skillwright` | Reads the GitHub Release assets; job `binstall` checks it |

## The flow

```mermaid
flowchart TD
    A[Change merged to main] --> B[release-plz.yml: release-pr]
    B --> C[Release PR: version bump and changelog]
    C -->|owner merges| D[release-plz.yml: plan]
    D -->|"auth = token (first release) or oidc"| E{{crates-io environment approval}}
    E -->|owner approves| F[release-plz.yml: release]
    F --> G[crates.io: skillwright X.Y.Z]
    F --> H["Tag skillwright/vX.Y.Z + GitHub Release"]
    H --> I[skillwright-release.yml]
    I --> J[plan]
    J --> K[build: 4 targets]
    J --> L[notices]
    K & L --> M[release: upload assets, SHA256SUMS last]
    M --> N[npm: 5 packages, provenance]
    M --> O[homebrew: Formula/skillwright.rb in osdlc/homebrew-tap]
    M --> P[binstall: install check on macOS and Linux]
```

1. **Release PR.** On every push to main, `release-pr` opens or updates a
   pull request that bumps each changed crate's version and changelog. The
   `osdlc-release` GitHub App opens it, so its checks run.
2. **Merge.** The owner merges the release PR once its checks pass.
3. **Plan.** `plan` compares each crate's version with crates.io. If nothing
   is new it stops. Otherwise it picks one credential for the run:
   - `token` when a crate has never been published (its first release);
   - `oidc` (trusted publishing) for new versions of existing crates.
   A run that needs both is refused. See [First release of a crate](#first-release-of-a-crate).
4. **Approve.** The `release` job waits for approval of the `crates-io`
   environment. The owner approves it in the Actions tab.
5. **Publish and tag.** `release` publishes each new crate version, then the
   App pushes the tag `skillwright/vX.Y.Z` and creates the GitHub Release.
6. **Binary release.** The tag starts `skillwright-release.yml`:
   - `build` makes the four binaries (macOS arm64 and x64, Linux musl arm64
     and x64), and `notices` writes `THIRD_PARTY_NOTICES.md`.
   - `release` uploads the assets. It never replaces a published asset, and
     uploads `SHA256SUMS` last.
   - `npm`, `homebrew` and `binstall` run from those uploaded bytes.

## Who does what

```mermaid
sequenceDiagram
    actor Owner
    participant GH as GitHub (osdlc/osdlc)
    participant RP as release-plz.yml
    participant CR as crates.io
    participant SR as skillwright-release.yml
    participant NPM as npm
    participant TAP as osdlc/homebrew-tap

    GH->>RP: push to main
    RP->>GH: open or update release PR
    Owner->>GH: merge release PR
    GH->>RP: push to main
    RP->>Owner: wait for crates-io approval
    Owner->>RP: approve
    RP->>CR: publish skillwright X.Y.Z (token or OIDC)
    RP->>GH: tag skillwright/vX.Y.Z, GitHub Release
    GH->>SR: tag push
    SR->>GH: upload binaries, SHA256SUMS last
    SR->>NPM: publish 5 packages (OIDC, environment npm)
    SR->>TAP: commit Formula/skillwright.rb (App token, environment homebrew-tap)
    SR->>SR: cargo binstall check
```

Owner-only actions: merging the release PR, approving the `crates-io`
environment, and the one-time setup below. Everything else is automatic.

## Environments and secrets

All in osdlc/osdlc. Values live only in GitHub settings.

| Environment | Used by | Holds | Limited to |
|---|---|---|---|
| `release-plz` | `release-plz.yml` `release-pr` | `RELEASE_PLZ_APP_ID`, `RELEASE_PLZ_APP_PRIVATE_KEY` | main, no reviewer |
| `crates-io` | `release-plz.yml` `release` | `CARGO_REGISTRY_TOKEN` (publish-new-only), the App secrets | main, owner approval |
| `npm` | `skillwright-release.yml` `npm` | nothing; the job's OIDC token is the credential | main and `skillwright/v*` |
| `homebrew-tap` | `skillwright-release.yml` `homebrew` | `RELEASE_PLZ_APP_PRIVATE_KEY` | main and `skillwright/v*` |

The `osdlc-release` App must be installed on osdlc/osdlc and
osdlc/homebrew-tap with contents write. A tag ruleset on `*/v*` lets only the
App and admins create release tags.

## First release of a crate

crates.io and npm both allow trusted publishing only for a package that
already exists. So a new crate or package needs one-time steps.

```mermaid
flowchart LR
    A["Hold: publish = false<br/>+ release-plz.toml entry"] --> B[No trusted release pending on main]
    B --> C[PR lifts the hold]
    C --> D[Release run with auth = token]
    D --> E[Owner adds crates.io trusted publisher]
    E --> F[Later releases use OIDC]
```

**crates.io**

1. A new crate starts held: `publish = false` in its `Cargo.toml` and a
   `[[package]]` entry with `publish = false` and `release = false` in
   `packages/rust/release-plz.toml`.
2. Lift the hold in a pull request of its own, merged only when no other
   crate is waiting on a trusted-publishing release. To check, compare the
   versions on main with crates.io (`plan` prints the same table).
3. The release run uses `CARGO_REGISTRY_TOKEN`.
4. The owner adds a trusted publisher on crates.io: repository `osdlc/osdlc`,
   workflow `release-plz.yml`, environment `crates-io`.

**npm**, before the first tag:

```sh
node packages/rust/skillwright/release/dist.ts stage --dry-run
node packages/rust/skillwright/release/dist.ts stage
```

Run by an npm owner of `@osdlc`. For each of the five packages it publishes a
`0.0.1-stage` placeholder under the `stage` tag and adds the trusted
publisher: repository `osdlc/osdlc`, workflow `skillwright-release.yml`,
environment `npm`.

**Homebrew**: no per-package step. The `homebrew-tap` environment secret and
the App on osdlc/homebrew-tap are enough.

## Checking a release

After the binary release finishes:

```sh
brew update && brew install osdlc/tap/skillwright && skillwright --version
npm i -g @osdlc/skillwright && skillwright --version
cargo binstall -y skillwright && skillwright --version
cargo install skillwright && skillwright --version
curl -fsSL https://github.com/osdlc/osdlc/releases/download/skillwright/vX.Y.Z/install.sh | sh
```

Each prints `skillwright X.Y.Z`. Homebrew 7 asks to trust a third-party tap
once: `brew tap osdlc/tap && brew trust osdlc/tap`.

## When something fails

| Symptom | Cause | Fix |
|---|---|---|
| `plan` refuses the run | A first release and a trusted release are both pending | Release one first; hold the other |
| `release` waits forever | The `crates-io` approval was not given | Approve it in the Actions tab |
| `npm` fails with `404 Not Found - PUT` | The package or its trusted publisher does not exist | Run `dist.ts stage`, then re-run failed jobs |
| `homebrew` fails: `private-key` input must be set | `RELEASE_PLZ_APP_PRIVATE_KEY` missing from `homebrew-tap` | Add it, then re-run failed jobs |
| release-plz waits on the index, then times out | crates.io's sparse index lags the API | Wait for the index; re-run |
| `wasm` check fails on a PR | The committed wasm differs from CI's build | Take the files from that run's `tradecraft-wasm` artifact |

Re-run only the failed jobs:

```sh
gh run rerun <run-id> --repo osdlc/osdlc --failed
```

Published assets are never replaced, so a re-run ships the same bytes.
