---
'@osdlc/tiered-dirs': minor
---

Behaviour change: with the require-override variable set, a runtime directory that would fall back to the OS default now throws `OVERRIDE_REQUIRED`. Before, runtime was never required: when the durable directory was moved only by `overrides` (not the environment), runtime silently used the OS directory. Runtime still needs no variable of its own when the environment moves the durable directory.
New exports: `homeDir(opts?)`, the absolute home directory the per-OS table is built on (`HOME`, `USERPROFILE` on Windows, when absolute, else the OS account's home; throws `MISSING_BASE_DIR` when there is none), and `expandTilde(path, home, platform?)`, which expands a leading `~` (and `~\` on Windows) by the named platform's path rules. The resolvers' behaviour is unchanged: a relative `XDG_*` value, `~` included, is still ignored.
