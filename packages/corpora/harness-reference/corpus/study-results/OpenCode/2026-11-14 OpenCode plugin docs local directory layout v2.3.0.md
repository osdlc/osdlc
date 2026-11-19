---
kind: docs
reportedIn:
  - "[OpenCode docs source Build plugins overview at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20Build%20plugins%20overview%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: Load
excerpt:
  exact: "A local plugin directory with a `package.json` `name` and `exports` loads its parts through them, like the published package. Without them, it uses file names at its root: `server` (else `index`), `tui`, and `rpc` with a `.ts`, `.tsx`, or `.js` extension, and `gui-experimental.cjs` (or `.js`)."
  prefix: "json`](/cli/plugins) instead. - "
  suffix: " - See [Configure plugins](/plug"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> A local plugin directory with a `package.json` `name` and `exports` loads its parts through them, like the published package. Without them, it uses file names at its root: `server` (else `index`), `tui`, and `rpc` with a `.ts`, `.tsx`, or `.js` extension, and `gui-experimental.cjs` (or `.js`).
