---
"@osdlc/host-cleaner": minor
---

The `cargo` and `node` adapters, built into the `host-cleaner` command: `artifact` rows for Rust `target/` directories (those with a `CACHEDIR.TAG`) and `target/*/incremental` directories, and for `node_modules` in linked worktrees, each idle past `idleHours` (default 24) with no cargo or rustc process, or any busy process for node, in the checkout. Paths are resolved through `@osdlc/path-guard`, and `clean` records the bytes freed. Exported as `cargoAdapter` and `nodeAdapter`.
