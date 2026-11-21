# @osdlc/host-cleaner

## 0.1.1

### Patch Changes

- Updated dependencies [1ba6088]
  - @osdlc/typed-git@0.20.0
  - @osdlc/repo-cleaner@0.23.1

## 0.1.0

### Minor Changes

- 4e30735: The `cargo` and `node` plugins: idle Rust `target/` directories (and `incremental` directories where incremental builds are off) and `node_modules` in idle linked worktrees, with their size, refused while a build or other process works in the checkout or when the path leads outside it. Settings: `plugins.cargo.idleHours` and `plugins.node.idleHours`.
- 2241bd3: A new package: machine cleanup as plugins. A plugin proposes candidates and objects to other plugins' candidates; the core runs scope, discover, object, decide, re-check, prepare, delete and deleted in a fixed plugin order, with one flat plan and one receipt. What runs is chosen in repo-cleaner's words: the default, `select` (exactly these), `pick` (these as well) and `spare` (ids, paths, names or globs left alone). The `git` plugin is repo-cleaner's sweep and `removeCandidate`. The `host-cleaner` command works in repo-cleaner's phases and flags: `status`, `plan` and `clean` (the bare command explains them and exits 2), `--pick` adds, `--spare` takes away, `clean -i` chooses from a checklist, `--worktrees` and `--branches` narrow the git candidates and `status --all-rows` shows refused ones. Also `--plugin`, `--skip-plugin` (`--adapter` is an alias), config `plugins.<name>`, a receipt in the state directory and a log line per run.

### Patch Changes

- Updated dependencies [32263e3]
  - @osdlc/repo-cleaner@0.23.0
