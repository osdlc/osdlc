---
id: D-07
type: decision
state: accepted
created: 2026-11-22
---

# D-07: The symlink policy

## Decision

`scanVault` follows a symbolic link to a file or a folder wherever it points, including outside
the vault root. A broken link is skipped. A link to a folder the walk is already inside is not
walked again, so a link back up the tree ends. The README and SECURITY.md say to scan only
vaults you trust, and a test pins the behaviour for a link that points outside the root.

## Alternatives

| Choice                                     | Why not                                                           |
| ------------------------------------------ | ----------------------------------------------------------------- |
| Never follow a symlink                     | People link notes across folders and across vaults on purpose.     |
| Follow only links that stay in the vault   | It breaks a shared notes folder linked into several vaults.       |
| An option to not follow links out of the vault | Not added until a consumer needs it. See [T-01](../tasks/T-01-opt-out-of-following-symlinks.md). |

## Why

- Symlinked notes were made to work on purpose, and callers rely on them.
- The risk is a reader of someone else's vault. A vault holding `leak -> ../outside` indexes the
  files under `outside`, with their frontmatter. Documenting it puts the choice with the caller.

## Consequences

- A caller that scans a vault it did not write must check the vault's links first.
