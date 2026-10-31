---
'@osdlc/repo-cleaner': minor
---

**Breaking:** repo-cleaner no longer reads a config file. It sweeps the repository you are in, or the paths you pass, which can be directories holding checkouts. `--all` and `--config` are removed: pass the directories instead (`repo-cleaner ~/Developer ~/work`), or keep them in a shell alias. Removed from the library: `CONFIG_ENV`, `DEFAULT_CONFIG`, `RepoCleanerConfigSchema`, `TOOL`, `clearConfigCache`, `configPath`, `configuredRepos`, `loadConfig` and `RepoCleanerConfig`. `REPO_CLEANER_MACHINE_CONFIG` is no longer read. The package no longer depends on `@osdlc/config-layers`.
