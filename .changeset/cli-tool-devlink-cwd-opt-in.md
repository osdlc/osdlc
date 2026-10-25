---
'@osdlc/cli-tool': minor
---

Security fixes in devlink. A checkout it hands off to can no longer be chosen, or changed, by the directory the tool runs in.

- The cwd layer is now off unless a spec turns it on. It ran any directory above the cwd that had the spec's marker, so with a common marker such as `src/cli.ts`, running the tool inside an unrelated repository ran that repository's code. Two optional `ToolSpec` fields are new:
  - `cwdLayer: true` turns the cwd layer back on. Set it to keep the old behaviour, and only when your marker cannot match another project. A tool with a bash launcher that relies on the cwd layer must now set it.
  - `packageName` makes a directory a checkout only when its `package.json` has that `name` as well as the marker. It applies to every layer. `renderLauncher` throws for a spec that sets it, because the bash launcher cannot read JSON; use a JavaScript launcher with `execSelection`. So a bash-launcher tool has only its marker to tell its checkout apart, and the marker must be unique.
- `status()` now reports `cwd.suppressed: true` whenever the spec does not set `cwdLayer`, and `dev status` leaves out the `cwd:` line for such a spec.
- `execSelection` and the rendered bash launcher run Bun as `bun --no-env-file --config=<null device> run <entry>`. Bun read `.env*` and `bunfig.toml` from the cwd, so a repository the user stood in could set the tool's environment and run its own code through a `bunfig.toml` `preload` before the tool started. A checkout's own `bunfig.toml` is not read either, because Bun resolves the paths in it against the cwd.
- `execSelection` and the rendered bash launcher find `bun` (and the bash launcher `node`) on absolute `PATH` entries only, and fail with a message when there is none. A relative entry such as `bin` was searched from the cwd, and on Windows a bare-name spawn searches the cwd first, so a repository the user stood in could ship the `bun` that ran. `ExecOptions.bun` is still used as given. `@osdlc/command-seam` is now a dependency.
- A relative `<NAME>_HOME` is now ignored, in `resolve()` and in the rendered bash launcher. It was documented as an absolute path but resolved against the cwd. Under Git Bash, MSYS or Cygwin the bash launcher also takes a drive path (`C:/x`), as `resolve()` does on Windows.
- A relative `HOME` counts as unset in the bash launcher's link lookup and in `defaultBinDir`, and the account's home is used. Before, the link file was read from under the cwd.

A tool with a committed bash launcher should regenerate it with `renderLauncher` (the drift test will say so).
