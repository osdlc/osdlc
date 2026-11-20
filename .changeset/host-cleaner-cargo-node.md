---
"@osdlc/host-cleaner": minor
---

The `cargo` and `node` plugins: idle Rust `target/` directories (and `incremental` directories where incremental builds are off) and `node_modules` in idle linked worktrees, with their size, refused while a build or other process works in the checkout or when the path leads outside it. Settings: `plugins.cargo.idleHours` and `plugins.node.idleHours`.
