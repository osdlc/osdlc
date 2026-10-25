---
"@osdlc/wayfinder": minor
---

Config, trust, guide and clean move onto `@osdlc/cli-tool`'s shared commands.
One Zod schema now validates the config file, sets its key order and generates
`schema/config.json`.

New:

- `way config explain <key>` shows how a setting got its value, layer by layer.
- `way config set` writes `$schema` into the file, keeps the schema's key
  order and writes atomically.
- An unknown key in a config file warns with the closest known key.
- New user-only settings: `open` (`tui` or `web`), `theme` (`system`, `light`
  or `dark`) and `trust.tools.<tool>` (`paths` and `owners` for one tool).
- `way trust --scope <tool>` and `way trust --untrust-all`.
- `WAYFINDER_ROOT` moves the config, state and cache directories under one
  directory. `WAYFINDER_CONFIG_DIR`, `WAYFINDER_STATE_DIR` and
  `WAYFINDER_CACHE_DIR` move one each.
- `way clean --dev` removes `way dev` link state and the shims
  `way dev install` wrote. `way clean --legacy` removes files left under the
  tool's old name.
- `way clean` prunes empty parent directories, and names a config file that
  `WAYFINDER_CONFIG` chose before removing it.

Breaking:

- The old `waypost` names are no longer read: `WAYPOST_CONFIG`,
  `~/.config/waypost/config.json`, `waypost.config.json` and the old trust
  store and cache. Move any settings you still need into the wayfinder files,
  then run `way clean --legacy` to delete the old files.
- `way clean --all` is now `way clean --everything`.
- `way config set --project` refuses `allowExec: true`, `trust`, `open` and
  `theme`, as the web view does. Set them with `--user`.
- The MCP and HTTP adapters cannot grant trust, run `clean` removals, or
  change `trust`, `allowExec` or `tools`. Use the command line.
- `way trust --json` now prints
  `{action, changed, roots: [{root, trusted, by, rule?, scope?}]}` for every
  mode, `--list` included. Read `roots[0]` where you read the top-level
  fields before. `way trust --show` text is `trusted <root> (by marker)`.
- `way clean --json` now prints `{mode, stores}`.
- `way dev` link state is under `$XDG_CONFIG_HOME/way` on macOS too, and its
  directory variables are `WAYFINDER_ROOT` and `WAYFINDER_<KIND>_DIR` (they
  were `WAY_ROOT` and `WAY_<KIND>_DIR`). Run `way dev link` again on macOS,
  then `way clean --legacy` to remove the old state.
- A `~` at the start of an `XDG_*` variable is no longer expanded. Use an
  absolute path.
