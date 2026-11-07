---
id: D-02
type: decision
state: accepted
created: 2026-11-07
---

# D-02: State lives under the caller's runtime directory

## Decision

- The package picks no directory of its own. `hostRegistry({ runtimeDir })` takes one, and each
  host that keeps state (`orca`, `herdr`, `wezterm`, `vscode`, `jetbrains`) takes `runtimeDir`
  or `registryDir` (`HostStateOptions`). The type requires one of the two.
- A host keeps its files under `<runtimeDir>/hosts/<name>/`: the pane bound to each session, and
  the VS Code and JetBrains companions' window registries.

## Why

- The companions register their windows where the host reads them, so the directory is a
  contract between a host and an app outside the package. Only the caller knows where its
  companions write.
- A default would be a guess at a vendor and product name, and a test that forgets to override
  it would write into the user's real state.

## Consequences

- Every process that should see the same sessions passes the same `runtimeDir`.
- The directory must be private to the user (mode 0700); see SECURITY.md.
