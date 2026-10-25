# @osdlc/cli-tool

## 0.8.0

### Minor Changes

- 910deca: Security fixes in devlink. A checkout it hands off to can no longer be chosen, or changed, by the directory the tool runs in.
  
  - The cwd layer is now off unless a spec turns it on. It ran any directory above the cwd that had the spec's marker, so with a common marker such as `src/cli.ts`, running the tool inside an unrelated repository ran that repository's code. Two optional `ToolSpec` fields are new:
    - `cwdLayer: true` turns the cwd layer back on. Set it to keep the old behaviour, and only when your marker cannot match another project. A tool with a bash launcher that relies on the cwd layer must now set it.
    - `packageName` makes a directory a checkout only when its `package.json` has that `name` as well as the marker. It applies to every layer. `renderLauncher` throws for a spec that sets it, because the bash launcher cannot read JSON; use a JavaScript launcher with `execSelection`. So a bash-launcher tool has only its marker to tell its checkout apart, and the marker must be unique.
  - `status()` now reports `cwd.suppressed: true` whenever the spec does not set `cwdLayer`, and `dev status` leaves out the `cwd:` line for such a spec.
  - `execSelection` and the rendered bash launcher run Bun as `bun --no-env-file --config=<null device> run <entry>`. Bun read `.env*` and `bunfig.toml` from the cwd, so a repository the user stood in could set the tool's environment and run its own code through a `bunfig.toml` `preload` before the tool started. A checkout's own `bunfig.toml` is not read either, because Bun resolves the paths in it against the cwd.
  - `execSelection` and the rendered bash launcher find `bun` (and the bash launcher `node`) on absolute `PATH` entries only, and fail with a message when there is none. A relative entry such as `bin` was searched from the cwd, and on Windows a bare-name spawn searches the cwd first, so a repository the user stood in could ship the `bun` that ran. `ExecOptions.bun` is still used as given. `@osdlc/command-seam` is now a dependency.
  - A relative `<NAME>_HOME` is now ignored, in `resolve()` and in the rendered bash launcher. It was documented as an absolute path but resolved against the cwd. Under Git Bash, MSYS or Cygwin the bash launcher also takes a drive path (`C:/x`), as `resolve()` does on Windows.
  - A relative `HOME` counts as unset in the bash launcher's link lookup and in `defaultBinDir`, and the account's home is used. Before, the link file was read from under the cwd.
  
  A tool with a committed bash launcher should regenerate it with `renderLauncher` (the drift test will say so).

### Patch Changes

- Updated dependencies [910deca]
- Updated dependencies [910deca]
  - @osdlc/command-seam@0.10.0
  - @osdlc/config-layers@0.7.1

## 0.7.0

### Minor Changes

- 007d8ee: Importing `@osdlc/cli-tool` no longer loads yaml and zod. The root now takes its directory helpers from a new `@osdlc/config-layers/dirs` subpath, and `closestMatches` and `didYouMean` from a new `@osdlc/config-layers/did-you-mean` subpath. The root's exports are unchanged.
  
  `@osdlc/cli-tool` also adds the subpaths `./define-cli`, `./io`, `./prompt` and `./exit`, so a tool can import only the parts it uses.

### Patch Changes

- 96b7144: Declare `zod` (`^4`) as a peer dependency. Parts of cli-tool load `@osdlc/config-layers`, which needs zod. cli-tool did not declare it, so consumers had to find and install it themselves.
- Updated dependencies [007d8ee]
  - @osdlc/config-layers@0.7.0

## 0.6.0

### Minor Changes

- d9b0f77: **Breaking:** a classified failure now sets the exit code of its category. A classified failure is reported the same way by every CLI. `runMain` renders a thrown `FailureError` (including `CommandFailed`, which carries command-seam's kinds only) as `<tool>: <message> <hint>` and exits with the code for its kind from one shared table: 22 for a missing tool, 23 when a service refused the caller or answered unusably, 24 when there is no repository or remote, 25 when the service could not be reached or rate-limited. Any other kind, such as the generic `exit` of a bare `CommandFailed`, exits 1, and a thrown non-failure keeps its message and exit 1. New exports: `FAILURE_EXIT`, `EXIT_FAILURE`, `exitCodeFor`, `failureOf`, `renderFailure` and `failWith` (report a `Result` failure and return its exit code without throwing). `@osdlc/result` is a new dependency.
- d9b0f77: **Breaking:** typed-git's plain door throws the classified failure, as typed-gh's does. A failed git call (any verb, `rawChecked`) now throws a `FailureError` whose `failure` is the `GitFailure` and whose `failure.cause` is the `CommandFailed`, where it threw the `CommandFailed` itself. The bare `CommandFailed` had only command-seam's generic `exit` kind, so a signed-out `git push` exited 1 from `runMain` instead of 23. Read `error.failure.argv` and `error.failure.cause.result` where you read `error.argv` and `error.result`.
  
  New `GitFailureKind` `tls`: `unable to access … SSL certificate problem` is no longer `remote-unreachable`. The host answered, so retrying cannot help until the system clock, the CA certificates or the remote's certificate is fixed. `@osdlc/cli-tool` numbers `tls` 23, with the other "fix it" failures; `@osdlc/pr-update` accounts for it in its exit-table check and reads a push failure through the `FailureError`'s cause.

### Patch Changes

- fb712e0: Ship the compiled `dist/` only. The `bun` export condition and the TypeScript source are no longer in the package, so Bun, Node and every bundler load the same compiled ESM and `.d.ts` files. Bun still works through the compiled `dist/`.
- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.
- Updated dependencies [fb712e0]
- Updated dependencies [fb712e0]
- Updated dependencies [d9b0f77]
  - @osdlc/etag-write@0.2.1
  - @osdlc/config-layers@0.6.1
  - @osdlc/result@0.1.0

## 0.5.0

### Minor Changes

- d093384: **Breaking:** `./trust` moved to `@osdlc/trust-repo`. Import from `@osdlc/trust-repo` instead of `@osdlc/cli-tool/trust`.

## 0.4.0

### Minor Changes

- 7a92833: First public release. `@osdlc/cli-tool` is what a standalone CLI needs before it does anything of its own. It moves here from the development repository, where it was `@sksizer/cli-tool`.
  
  - The CLI substrate: `CliIo` with `processIo` and `captureIo`, the `CliContext` a `main` is handed, the `EXIT` codes (`ok` 0, `error` 1, `usage` 2) with a 10-63 band for a tool's own outcomes, and `runMain` for the bin shim. `runMain` sets `process.exitCode` and never calls `process.exit`.
  - `defineCli`: flags declared once over commander, so the parser and the help text cannot disagree. Kinds: `boolean`, `tristate`, `string`, `enum`, `list` and `count`. `parse` returns `ok`, `help` or `error` as a value and writes nothing to a process stream.
  - A yes/no prompt: `askYesNo`, `canPrompt`, `readLine` and `isYes`.
  - Close-match suggestions and directory helpers, re-exported from `@osdlc/config-layers`.
  - `@osdlc/cli-tool/devlink`: run an installed tool from a development checkout, with `install`, `link`, `use`, `off`, `status` and `history`, and a generated `sh` or bash launcher.
  - `@osdlc/cli-tool/trust`: a per-repository trust store, a standing policy over it, and an exec gate.
  - Depends on `@osdlc/config-layers`, `@osdlc/etag-write`, `@osdlc/path-guard` and `commander`. ESM with `.d.ts` types, for Node 22.18 or newer; Bun also runs it. Licence `MIT OR Apache-2.0`.
