---
"@osdlc/cli-tool": minor
---

devlink: a hand-off from a process running under Bun reuses that bun, so a proto shim first on `PATH` no longer breaks it. `devlinkHook` refuses a checkout chosen by the env, cwd or link layer whose `node_modules` is missing or incomplete, with the bash launcher's "Run 'bun install' there" lines and exit 1. An `execve` that fails for a reason other than `ENOENT` or `EACCES` falls back to a spawn. New exports from `@osdlc/cli-tool/devlink`: `missingDependency` and `installDir`. The launch-order guide gains "One run, step by step", "A tool with its own entry script" and "Adopting devlink in a new CLI".
