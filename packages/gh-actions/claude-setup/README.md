# claude-setup

Installs a pinned Claude Code CLI on the runner and adds it to `PATH`.
Optionally adds plugin marketplaces and installs plugins from them.

```yaml
- uses: osdlc/osdlc/packages/gh-actions/claude-setup@<commit-sha> # claude-setup/v0.1.0
  with:
    marketplaces: https://github.com/osdlc/marketplace.git
    plugins: craft@osdlc
```

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `version` | `2.1.319` | Claude Code version to install. |
| `marketplaces` | none | Marketplace sources, one per line. |
| `plugins` | none | Plugins to install, one per line, as `plugin@marketplace`. |

## Outputs

| Output | Meaning |
| --- | --- |
| `claude-path` | Absolute path to the installed `claude` binary. |

Authentication is not set here; pass `ANTHROPIC_API_KEY` to the step that runs
`claude`.

## Licence

`MIT OR Apache-2.0`.
