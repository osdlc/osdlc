---
'@osdlc/cli-tool': patch
---

devlink's cwd layer is now off unless a spec turns it on. It ran any directory above the cwd that had the spec's marker, so with a common marker such as `src/cli.ts`, running the tool inside an unrelated repository ran that repository's code. Two optional `ToolSpec` fields are new:

- `cwdLayer: true` turns the cwd layer back on. Set it to keep the old behaviour, and only when your marker cannot match another project.
- `packageName` makes a directory a checkout only when its `package.json` has that `name` as well as the marker. It applies to every layer. `renderLauncher` throws for a spec that sets it, because the bash launcher cannot read JSON; use a JavaScript launcher with `execSelection`.

A relative `<NAME>_HOME` is now ignored, in `resolve()` and in the rendered bash launcher. It was documented as an absolute path but resolved against the cwd. A tool with a committed bash launcher should regenerate it with `renderLauncher` (the drift test will say so).
