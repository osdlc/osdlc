---
'@osdlc/cli-tool': minor
---

devlink: a project that installs a tool in its own `node_modules` now runs that copy, so a project can pin the version it uses. The order is `<NAME>_HOME`, the cwd checkout (when on), `dev link`, the project's copy, then the running copy. The project copy is found as Node's `require` finds it and its bin runs under the runtime its `#!` line names, by path. `<NAME>_PROJECT=0` or `projectLayer: false` turns it off; suppressors turn it off as they do the cwd and link layers. A project that lists the package but has not installed it gets one hint line. `dev status` shows the project copy, and `--where` reports `project install (<dir>)`.

The `running … (why)` line now appears only on a hand-off to another copy, never for the local copy, in both the JavaScript hook and the generated bash launcher. A project hand-off to the same version is silent.
