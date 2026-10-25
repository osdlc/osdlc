---
"@osdlc/config-layers": patch
---

`resolveConfigPath` no longer expands `~` from a relative `HOME`. A value such as `HOME=.` used to resolve `~/x` against the working directory, which can be the repository being read. A relative `HOME` now counts as unset, and the OS account's home is used. An explicit `home` option is used as given.
