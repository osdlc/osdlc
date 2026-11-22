---
"@osdlc/host-cleaner": minor
---

`profiles` in the config holds named overrides of `targets`, `ignore`, `idleHours` and `plugins`, chosen with `--profile <name>` on `status`, `plan`, `clean` and `config`. A profile is deep-merged over the config (`ignore` only grows), checked when the config loads, and an unknown name is refused.
