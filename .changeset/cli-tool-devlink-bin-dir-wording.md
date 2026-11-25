---
"@osdlc/cli-tool": patch
---

`dev install`'s usage text and the devlink README now say what the default shim directory is: `$XDG_BIN_HOME` when it is an absolute path, else `~/.local/bin`. They said `${XDG_BIN_HOME:-$HOME/.local/bin}`, which a relative `XDG_BIN_HOME` does not follow.
