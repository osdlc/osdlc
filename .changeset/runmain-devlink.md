---
'@osdlc/cli-tool': minor
---

`runMain` takes a `devlink` hook, and the devlink entry's `devlinkHook(spec)` makes one. With it, `<name> dev …` links, installs and reports a development checkout, and a linked checkout (or `<NAME>_HOME`) runs in place of the installed code, as `way` and `sdlc` do. The hook finds the checkout it runs from by walking up from the script, never through `node_modules`. `execSelection` now sets `<NAME>_LAUNCH_LAYER` in the process it starts, as the bash launcher does, and the hook does not hand off again from such a process. The root entry does not load devlink; only a tool that passes the hook does.
