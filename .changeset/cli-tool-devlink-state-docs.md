---
'@osdlc/cli-tool': patch
---

Doc comments only. `ToolSpec.vendorDirs` no longer says the bash launcher ignores the vendor's override variables: it reads `<P>_CONFIG_DIR`, then `<P>_ROOT`, then the `xdg` default, as `dev link` does. `StateOptions.dirs` says the launcher cannot see it, and points at those variables for moving the state.
