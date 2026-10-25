---
'@osdlc/trust-repo': minor
---

Grants for one tool, a private store, Windows path matching, and the path expander and git owner lookup that tools used to write themselves.

- Grants are keyed by root and scope. The scope is `*` (`WHOLE_REPO_SCOPE`) for the whole repository, or any string you choose, such as a tool id. `isTrusted`, `trust`, `untrust` and `markerPath` take an optional `scope`, which defaults to `*`, so existing calls behave as before. A whole-repository grant covers every scope. New store members: `untrustAll(root)`, `listGrants()` (every grant with its scope) and `tighten()`. `list()` still returns only roots with a whole-repository grant. Existing markers are read as they are, with no migration.
- `resolveExecGate` and `policyExecGate` take `scopes`, every tool a command will run (a mise task also runs mise). The gate allows the run only when every scope is trusted. `ExecGate` gains `scopes` and `missing`. `policyExecGate` returns `decisions`, one per scope. `TrustPolicy` gains `scopes`, rules for one scope each. A trusted `TrustDecision` now carries `scope`, the grant or rules that decided. Code that builds an `ExecGate` object by hand must add `scopes` and `missing`. Code that compares decisions with deep equality must expect `scope`.
- `policyExecGate` with `flag: false` now returns before any lookup. It reads no marker and does not call `ownerOf`, so `--no-exec` runs no git.
- The store directory is created 0700 and markers are written 0600. `trust()` tightens a store left at 0755 and 0644 by an older release.
- New `expandTrustPath(raw, home)`: the `expandPath` most tools want. It expands `~` and resolves symlinks in the glob's static prefix. Remove your own copy and use this one.
- New entry point `@osdlc/trust-repo/git` with `originOwner(root)`, the git-backed `ownerOf` for `policy.owners`. It now depends on `@osdlc/command-seam` and `@osdlc/typed-git`. The main entry point still runs no program.
- Trust paths match on Windows. Keys and `paths` globs use `/` and a lower-case drive letter, and `~\` expands. New `normalizeTrustPath` and `expandTilde`. The marker name of a Windows root changes; Windows was not supported before.
