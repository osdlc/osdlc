---
'@osdlc/trust-repo': minor
---

Grants for one tool, a private store, Windows path matching, and the path expander and git owner lookup that tools used to write themselves.

- Grants are keyed by root and scope. The scope is `*` (`WHOLE_REPO_SCOPE`) for the whole repository, or any string you choose, such as a tool id. `isTrusted`, `trust`, `untrust` and `markerPath` take an optional `scope`, which defaults to `*`, so existing calls behave as before. A whole-repository grant covers every scope. Every store method trims its scope, so `'just '` and `'just'` are one grant. A scope that is then empty, longer than 200 characters or holds a control character throws a `TypeError`. `trust(root, '*')` throws too: a whole-repository grant is `trust(root)`, so a typed scope cannot widen into one. Existing markers are read as they are, with no migration.
- New `parseTrustScope(input)`: a scope a person typed, trimmed and checked, with `*` refused. A CLI calls it on a `--scope` value and reports the `TypeError` as a usage error.
- New store members: `untrustAll(root)` removes the root's marker and its whole folder of per-scope grants, `listGrants()` lists every grant with its scope, and `tighten()` sets the store's file modes. `list()` still returns only roots with a whole-repository grant.
- `resolveExecGate` and `policyExecGate` take `scopes`, every tool a command will run (a mise task also runs mise). The gate allows the run only when every scope is trusted. `ExecGate` gains `scopes` and `missing`. `policyExecGate` returns `decisions`, one per scope. `TrustPolicy` gains `scopes`, rules for one scope each. A trusted `TrustDecision` now carries `scope`, the grant or rules that decided. A scope named after an `Object.prototype` member (`constructor`, `__proto__`) is an ordinary scope.
- `policyExecGate` with `flag: false` now returns before any lookup. It reads no marker and does not call `ownerOf`, so `--no-exec` runs no git.
- The store directory is created 0700 and markers are written 0600.
- New `expandTrustPath(raw, home)`: the `expandPath` most tools want. It expands `~` and resolves symlinks in the glob's static prefix. Remove your own copy and use this one.
- New entry point `@osdlc/trust-repo/git` with `originOwner(root)`, the git-backed `ownerOf` for `policy.owners`. The package now depends on `@osdlc/command-seam` and `@osdlc/typed-git`. The main entry point still runs no program.
- Trust paths match on Windows. Keys and `paths` globs use `/` and a lower-case drive letter, and `~\` expands. New `normalizeTrustPath` and `expandTilde`. Windows was not supported before, so no Windows marker from an older release exists to move. Concurrent grants for one root no longer fail with `EPERM` on Windows.

**Breaking changes**

- `TrustStore` has new required members: `untrustAll`, `listGrants` and `tighten`, and a `scope` parameter on `markerPath`, `isTrusted`, `trust` and `untrust`. `TrustResult` has a new required `scope`. What to do: a class or test double that implements `TrustStore` adds the three methods and accepts `scope`. Code that builds a `TrustResult` sets `scope` (`WHOLE_REPO_SCOPE` for a whole-repository grant). A store from `trustStore()` needs no change.
- `ExecGate` has new required fields `scopes` and `missing`. What to do: code that builds an `ExecGate` by hand, such as a test double, adds them (`scopes: ['*']`, `missing: []` for a trusted whole-repository gate).
- A trusted `TrustDecision` and `PolicyDecision` now carry `scope`. What to do: a test that compares a decision with deep equality expects `scope: '*'` for a whole-repository grant or a top-level rule.
- `trust()` now changes the modes of a store that already exists: on POSIX it sets the store directory to 0700 and every marker in it to 0600 when they are looser, including markers an older release wrote at 0755 and 0644. What to do: nothing, unless another account or group reads the store. That no longer works; give that reader its own store.
- `engines.node` is `^22.22.2 || ^24.15.0 || >=26.0.0`, narrowed from `>=22`, the range of the new dependency `@osdlc/typed-git`. Node 22.0 to 22.22.1, 23, 24.0 to 24.14 and 25 are no longer supported. What to do: upgrade Node to a supported release.
