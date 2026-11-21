---
"@osdlc/host-cleaner": minor
---

A new package: machine cleanup as plugins. A plugin proposes candidates and objects to other plugins' candidates; the core runs scope, discover, object, decide, re-check, prepare, delete and deleted in a fixed plugin order, with one flat plan and one receipt. What runs is chosen in repo-cleaner's words: the default, `select` (exactly these), `pick` (these as well) and `spare` (ids, paths, names or globs left alone). The `git` plugin is repo-cleaner's sweep and `removeCandidate`. The `host-cleaner` command reports, plans and cleans: `--plugin`, `--skip-plugin` (`--adapter` is an alias), config `plugins.<name>`, a receipt in the state directory and a log line per run.
