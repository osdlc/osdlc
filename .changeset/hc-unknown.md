---
"@osdlc/host-cleaner": minor
---

`clean --plan` refuses a plan whose candidates belong to a plugin this install does not have, and so does the library's `recheck`, which throws the new `StalePlan` (pass it every known plugin name as its fourth argument, and `clean` as its `known` option). A config entry for an unknown plugin name still stops `clean` (with `--plan` and `--dry-run` too) with exit 2 before anything is deleted; `status`, `plan` and `config` now warn of it (also in `status --format json`'s `warnings` and in a plan) and go on, and `config` shows only the plugins a run would build.
