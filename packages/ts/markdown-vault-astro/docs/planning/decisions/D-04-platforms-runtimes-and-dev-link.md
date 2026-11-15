---
id: D-04
type: decision
state: accepted
created: 2026-11-08
---

# D-04: Platforms, runtimes and the dev command

## Decision

- Node.js is the only claimed runtime. `engines.node` is `>=22`.
- Linux and macOS are supported. Windows is untested and the README says so.
- The package ships compiled ESM and `.d.ts` files under `dist/`, and the `markdown-vault-astro` bin in `bin/`. It does not ship its TypeScript source.
- `markdown-vault-astro dev link|status|off` stays in the public CLI, for contributors, and the README documents it in a short section. The CLI tests run the built bin.
- Another runtime, such as Bun, is claimed only once a test runs on it.

## Why

- The home runs its checks on Node 22, 24 and 26 on Linux and macOS, with no Windows job for this package.
- Node refuses to run `.ts` files under `node_modules`, so a package must ship JavaScript.

## Consequences

Windows support needs path handling in the asset index and a Windows CI job first.
