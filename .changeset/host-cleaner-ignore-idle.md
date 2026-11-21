---
"@osdlc/host-cleaner": minor
---

A machine-wide `ignore` list in the config, and `--ignore <dir>` on `status`, `plan` and `clean`, keep every plugin's candidates out of the listed paths; a saved plan records the list and a re-check drops what falls inside it as `ignored`. A top-level `idleHours` is the default for the `cargo` and `node` plugins, and `0` is now accepted and takes every artifact.
