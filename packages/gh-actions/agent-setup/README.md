# agent-setup

Installs a pinned coding-agent CLI (`claude`, `codex` or `cursor`) on the
runner, adds it to `PATH`, and optionally installs plugins from marketplaces
through [skillwright](https://github.com/osdlc/skillwright).

## Use

```yaml
- uses: osdlc/osdlc/packages/gh-actions/agent-setup@<commit-sha> # gh-actions/v1
  id: setup
  with:
    harness: claude
    marketplaces: osdlc=https://github.com/osdlc/marketplace.git
    plugins: craft@osdlc
```

Codex, the same plugins:

```yaml
- uses: osdlc/osdlc/packages/gh-actions/agent-setup@<commit-sha> # gh-actions/v1
  with:
    harness: codex
    marketplaces: osdlc=https://github.com/osdlc/marketplace.git main
    plugins: craft@osdlc
```

Cursor, which registers marketplaces but cannot install their plugins:

```yaml
- uses: osdlc/osdlc/packages/gh-actions/agent-setup@<commit-sha> # gh-actions/v1
  with:
    harness: cursor
    marketplaces: osdlc=https://github.com/osdlc/marketplace.git
```

## Inputs

| Input                 | Default           | Meaning                                                                                                            |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `harness`             | required          | `claude`, `codex` or `cursor`.                                                                                     |
| `version`             | per harness below | CLI version to install.                                                                                            |
| `marketplaces`        | none              | One per line: `name=https-git-url`, then an optional ref after a space. `name` must be the marketplace's own name. |
| `plugins`             | none              | One per line: `plugin@marketplace`. The marketplace must be listed in `marketplaces`.                              |
| `sha256`              | none              | SHA-256 of the cursor tarball. Built in for the default cursor build; required for any other cursor version.       |
| `skillwright-version` | `0.7.0`           | skillwright release that installs the plugins.                                                                     |

| Harness  | Default version      | How it installs                                                  | Pinning                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude` | `2.1.319`            | `https://claude.ai/install.sh <version>`                         | Version only; the installer checks the binary against the release manifest it fetches.                                                                                                                                                                                                                                                                                                                         |
| `codex`  | `0.162.0`            | `npm install --global --prefix ~/.local @openai/codex@<version>` | Version only; npm checks the registry's integrity hash.                                                                                                                                                                                                                                                                                                                                                        |
| `cursor` | `2026.11.05-86047df` | tarball from `downloads.cursor.com/lab/<version>/...`            | Version and tarball SHA-256. Not through `cursor.com/install`, which hard-codes the current build and takes no version. The version is a full build id, date and commit; the default build's checksums (linux and darwin, x64 and arm64) are in `setup.sh`, any other build needs the `sha256` input (`sha256sum` the tarball from `downloads.cursor.com/lab/<version>/<os>/<arch>/agent-cli-package.tar.gz`). |

## Outputs

| Output     | Meaning                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| `cli-path` | Absolute path to the harness binary (`claude`, `codex`, or cursor's `agent`). |

## Plugins

Plugins go in through `skillwright harness install <harness> --git-url ...`,
which runs the harness's own `plugin` commands, so one input shape serves
claude and codex. skillwright wants a vault and a build folder even for a
remote marketplace, so the action gives each marketplace an empty one named
after it; that folder name is what plugin ids end in (`craft@osdlc`).
skillwright is installed from its pinned release with `install.sh`, which
checks the binary against the release's `SHA256SUMS`.

Limits:

- Cursor: skillwright only registers the marketplace; `cursor-agent` has no
  per-plugin install, so `plugins` on cursor is an error.
- Claude: skillwright passes no ref to `claude plugin marketplace add`, so a
  ref on a claude marketplace is an error. Pin by URL.
- Marketplaces must be HTTPS git URLs.
- Cursor: registering a marketplace calls `cursor-agent plugin marketplace list`,
  which needs `CURSOR_API_KEY` in the step's env. The test workflow installs
  cursor with no marketplace because it has no secrets.
- The `name` you give must match the name in the marketplace's own manifest.

## What is verified

- Cursor: the tarball's SHA-256 against the built-in value or `sha256`, before
  it is unpacked. A mismatch fails the step.
- Claude: `claude.ai/install.sh` is fetched by URL and not hash-pinned. It
  downloads the release `manifest.json` for the version and checks the binary
  against the manifest's SHA-256 (and the `.zst` form when used). The manifest
  comes from the same host as the binary, so this catches corruption, not a
  compromised host.
- skillwright: `install.sh` is fetched by URL and not hash-pinned. It checks
  the binary against the release's `SHA256SUMS`, from the same release.
- Codex: npm verifies the package against the registry's integrity hash.
- Every download uses `curl --proto '=https' --tlsv1.2 --retry 3`.
- Supported runners: Linux and macOS (x64 and arm64) for claude and cursor;
  the test workflow covers ubuntu-latest and macos-latest, and codex on Linux
  only.

## Security

- Pin the action to a commit SHA, as above, not to `v1`. The tag moves.
- Credentials (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CURSOR_API_KEY`) come
  from the env of the step that runs the agent. This action takes none and
  never sees them.
- Inputs reach the script as environment variables and are checked before use (the version
  per harness, the other inputs against character patterns, marketplace URLs
  for https and no user info); none is interpolated into shell.
- Plugins run with the agent's rights. Install only marketplaces you trust.

## Licence

`MIT OR Apache-2.0`.
