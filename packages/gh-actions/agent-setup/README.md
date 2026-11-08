# agent-setup

Installs a pinned coding-agent CLI (`claude`, `codex` or `cursor`) on the
runner, adds it to `PATH`, and optionally installs plugins from marketplaces
through [skillwright](https://github.com/osdlc/skillwright).

## Use

```yaml
- uses: osdlc/osdlc/packages/gh-actions/agent-setup@<commit-sha> # v1
  id: setup
  with:
    harness: claude
    marketplaces: osdlc=https://github.com/osdlc/marketplace.git
    plugins: craft@osdlc
```

Codex, the same plugins:

```yaml
- uses: osdlc/osdlc/packages/gh-actions/agent-setup@<commit-sha> # v1
  with:
    harness: codex
    marketplaces: osdlc=https://github.com/osdlc/marketplace.git main
    plugins: craft@osdlc
```

Cursor, which registers marketplaces but cannot install their plugins:

```yaml
- uses: osdlc/osdlc/packages/gh-actions/agent-setup@<commit-sha> # v1
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
| `skillwright-version` | `0.7.0`           | skillwright release that installs the plugins.                                                                     |

| Harness  | Default version      | How it installs                                                  | Pinning                                                                                                                                              |
| -------- | -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude` | `2.1.319`            | `https://claude.ai/install.sh <version>`                         | Yes, the installer takes the version.                                                                                                                |
| `codex`  | `0.162.0`            | `npm install --global --prefix ~/.local @openai/codex@<version>` | Yes.                                                                                                                                                 |
| `cursor` | `2026.11.05-86047df` | tarball from `downloads.cursor.com/lab/<version>/...`            | Yes, but not through `cursor.com/install`, which hard-codes the current build and takes no version. The version is a full build id, date and commit. |

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
- The `name` you give must match the name in the marketplace's own manifest.

## Security

- Pin the action to a commit SHA, as above, not to `v1`. The tag moves.
- Credentials (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CURSOR_API_KEY`) come
  from the env of the step that runs the agent. This action takes none and
  never sees them.
- Inputs reach the script as environment variables and are checked against
  strict patterns before use; none is interpolated into shell.
- Plugins run with the agent's rights. Install only marketplaces you trust.

## Licence

`MIT OR Apache-2.0`.
