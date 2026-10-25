---
'@osdlc/tiered-dirs': patch
---

Behaviour change: with the require-override variable set, a runtime directory that would fall back to the OS default now throws `OVERRIDE_REQUIRED`. Before, runtime was never required: when the durable directory was moved only by `overrides` (not the environment), runtime silently used the OS directory. Runtime still needs no variable of its own when the environment moves the durable directory.
