---
"@osdlc/trust-repo": patch
---

The owner lookup in `@osdlc/trust-repo/git` runs git with hooks off, and
without every variable in typed-git's `REPOSITORY_VARS`, where before it
removed only `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and
`GIT_COMMON_DIR`. It still ignores inherited `GIT_CONFIG_*` variables, so an
`insteadOf` rule passed on from a parent git cannot change the owner. The
variables are now left out of git's environment only, so `process.env` is no
longer changed during the lookup.
