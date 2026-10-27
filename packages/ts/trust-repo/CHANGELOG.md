# @osdlc/trust-repo

## 0.5.1

### Patch Changes

- Updated dependencies [da5e6a3]
- Updated dependencies [da5e6a3]
  - @osdlc/command-seam@0.14.0
  - @osdlc/typed-git@0.10.0

## 0.5.0

### Minor Changes

- b835ae4: `list` and `listGrants` no longer report a whole-repository grant from a stray or renamed marker file (`old-repo`, an editor's `repo~`), which `isTrusted` never read and `untrustAll` never removed.
  `homeDir` and `expandTilde` are now `@osdlc/tiered-dirs`'s (a new runtime dependency). Behaviour change: `homeDir` throws a `TieredDirsError` (code `MISSING_BASE_DIR`) instead of a plain `Error` when no absolute home can be found; the home it returns is unchanged.

### Patch Changes

- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [fdef74f]
  - @osdlc/command-seam@0.13.0
  - @osdlc/etag-write@0.3.0
  - @osdlc/tiered-dirs@0.5.0
  - @osdlc/typed-git@0.9.0

## 0.4.0

### Minor Changes

- 9616994: Grants for one tool, a private store, Windows path matching, and the path expander and git owner lookup that tools used to write themselves.
  
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

### Patch Changes

- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
  - @osdlc/command-seam@0.12.0
  - @osdlc/typed-git@0.8.1

## 0.3.0

### Minor Changes

- 910deca: Security fixes.
  
  - `policy.owners` now matches the host as well as the owner. An entry is `host/owner` (`gitlab.com/my-org`) or a bare `owner`, which means `github.com/owner`. Before, `my-org` also trusted a clone from `gitlab.com/my-org`. Your `ownerOf` should return `host/owner`; a bare owner it returns is read as a GitHub owner, which keeps an older `ownerOf` working for GitHub remotes.
  - `xdgHome`, and so `trustStoreDir`, now ignores a relative XDG variable, as the XDG spec says, and uses the fallback under `home`. A relative `XDG_STATE_HOME` used to resolve against the cwd, which put the trust store inside whatever directory the tool ran in.
  - The default `home` of `trustStore` and `trustStoreDir` is the new `homeDir()`: `os.homedir()` when it is absolute, else the OS account's home. A relative `HOME` used to put the trust store under the cwd.
  - The README now says plainly that owner trust believes the repository's own git config: the remote URL comes from a `.git/config` that arrives with the directory, so `owners` fits clones you made yourself, and `paths` is the stronger form.

## 0.2.2

### Patch Changes

- fb712e0: Ship the compiled `dist/` only. The `bun` export condition and the TypeScript source are no longer in the package, so Bun, Node and every bundler load the same compiled ESM and `.d.ts` files. Bun still works through the compiled `dist/`.
- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.
- Updated dependencies [fb712e0]
- Updated dependencies [fb712e0]
  - @osdlc/etag-write@0.2.1
  - @osdlc/path-guard@0.3.1

## 0.2.1

### Patch Changes

- Updated dependencies [b9d583c]
  - @osdlc/path-guard@0.3.0

## 0.2.0

### Minor Changes

- d093384: First release. Per-repository consent to run a repository's own scripts: a marker store kept under the XDG state directory, an exec gate that combines a configured value, a per-run flag and the store, and a policy of path globs and owners layered over the markers. It moved here from `@osdlc/cli-tool/trust`.
