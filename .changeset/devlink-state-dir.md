---
'@osdlc/cli-tool': minor
---

devlink: a `ToolSpec` can set `stateDir: '~/.tooly'` to keep its link and history under a directory of its own in place of `${XDG_CONFIG_HOME:-~/.config}/<name>`. `stateDir()` uses it, and `renderLauncher` bakes the same path into the bash launcher, so `dev link` and the launcher read one file. The vendor's `<P>_CONFIG_DIR` and `<P>_ROOT` still win on both sides, `XDG_CONFIG_HOME` is not read when it is set, and in a test runner the tiered-dirs test root still wins. The value must be `~/` and then a relative path of letters, digits, `.`, `_` and `-`; `validateSpec` and `renderLauncher` refuse anything else. A launcher rendered from a spec without `stateDir` is unchanged.
