# @osdlc/cli-tool

## 0.10.1

### Patch Changes

- Updated dependencies [da5e6a3]
  - @osdlc/command-seam@0.14.0

## 0.10.0

### Minor Changes

- b835ae4: A hyphenated flag key (`'project-local'`) is read back under its own key, not commander's camelCased one. `--output json` before the command word routes like `--json`. `captureContext` passes the abort `signal` through. `failWith` strips terminal control characters from what it prints. A command that is both a file and a directory in the command tree is an error.
  devlink (experimental): a relative `--bin-dir` resolves against the given cwd. `validateSpec` is stricter: `marker`, `entry` and `launcher` may not hold `.` or empty segments (so `./bin/x` and a trailing slash are refused), and each alias must be a single path segment. `CliIo` from the devlink entry is now the package's stable `CliIo`.
  Exit code change: through `@osdlc/command-seam`, a working directory that cannot be entered is now `bad-cwd` rather than `not-executable`, so a CLI built on cli-tool exits with the `repository` code there instead of `missingTool`.
  devlink (experimental), stricter: `findOnPath`, and so `dev status`, now reports only an executable file on an absolute `PATH` entry, through `@osdlc/command-seam`'s `which`. A relative entry, a file without the execute bit and a dangling symlink are no longer reported. `dev status`'s "move it" line quotes paths with `@osdlc/command-seam`'s `shellQuote`, so a path of plain characters is printed bare and a `\` is quoted so the line also pastes into fish.
  New: `renderError(message, name?)`, the one renderer for an error line (`<name>: <message>` and a newline, terminal controls removed). `renderFailure`, `failWith`, `runMain` and an app's own error lines all go through it. Behaviour change: `renderFailure` itself now strips terminal controls from what it returns, not only the callers that print it.
  http (experimental): `newToken`, `tokenEquals` and `readBody`, the token and capped-body helpers the API is built from, are exported for an app's own routes.
  config-command (experimental): a store with `dryRun: true` gets `--dry-run` on `config set` and `config unset`; the store's `set` and `unset` receive `{ dryRun: true }` and the answer carries `dryRun: true` (text: `would set`, `would remove`). Behaviour change: `get`, `set`, `unset` and `explain` name the key as the store's `resolveKey` gives it, and `get` looks it up under that name. Behaviour change: `config get` of a key below a listed setting (`runners.order` when `runners` is listed) reads it out of that setting's value instead of exiting 1.
  config-command (experimental), behaviour change: a key the store's `resolveKey` cannot resolve is a usage error (exit 2) for `config get` and `config unset`, as it already was for `set` and `explain`, and `unset` reports a store's `ConfigUsageError` as a usage error instead of exit 1. A known key with no value still exits 1.

### Patch Changes

- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
  - @osdlc/command-seam@0.13.0
  - @osdlc/config-layers@0.8.0
  - @osdlc/etag-write@0.3.0
  - @osdlc/ux@0.1.1

## 0.9.1

### Patch Changes

- 7addea1: Doc comments only. `ToolSpec.vendorDirs` no longer says the bash launcher ignores the vendor's override variables: it reads `<P>_CONFIG_DIR`, then `<P>_ROOT`, then the `xdg` default, as `dev link` does. `StateOptions.dirs` says the launcher cannot see it, and points at those variables for moving the state.
- Updated dependencies [f013f38]
  - @osdlc/command-seam@0.12.1

## 0.9.0

### Minor Changes

- 9616994: A command tree can now be served to an agent over MCP and to a local page over HTTP, and lists print as JSON lines.
  
  - `--output text|json|jsonl` on every command. `--output json` is `--json`. A command that declares `items: { field, kind }` prints one JSON line per element of that list under `jsonl`, each with `schemaVersion` and `kind`.
  - A long-running command declares `events` and sends them with `ctx.emit`. They print as they happen, stream over HTTP and go to MCP clients as progress. `ctx.signal` is aborted when the caller cancels. `CliContext` takes an optional `signal`.
  - Commands declare `destructive`, and `exposure: 'cli-only'` (or `exposureOf(input)` per call) for commands the adapters must not run. The shared `trust` command makes granting trust `cli-only`. `ConfigStore.cliOnlyKeys` does the same for `config set` and `config unset` of trust keys.
  - `App.call(path, args, ctx, options)` runs a data command from a JSON object of its flags and positionals and enforces exposure. `App.argsSchema(path)` is the JSON Schema of that object. `schema` entries now carry `description`, `readOnly`, `destructive`, `exposure`, `items` and `events`.
  - New entry `@osdlc/cli-tool/mcp`: `mcpCommand()` (mount it as `mcp`), `serveMcp`, `createMcpServer`, `mcpTools`, `toolName`. It needs `@modelcontextprotocol/sdk` 1.32 or later, an optional peer dependency; no other entry loads it.
  - New entry `@osdlc/cli-tool/http`: `httpApiCommand()` (mount it as `serve-api`), `createHttpApi` for a handler an app mounts under a prefix beside its own page, and `serveHttp`. It binds 127.0.0.1, checks `Host` and `Origin`, requires a bearer token, and reads a body only after those checks. A mount may run named `cli-only` commands behind a one-time confirmation nonce.
  - `config explain <key>`, when the store has an `explain` method: each layer's value, which one won and why, including a layer that may not set the key.
  - MCP: two commands whose paths join to the same tool name (`a b` and `a_b`) make `mcpTools` and `createMcpServer` throw; rename one. A call to an unknown tool is a protocol error (`InvalidParams`). A failed call is an error result whose text is the error document as JSON, with `code` and the exit code in `_meta`.
  - HTTP: an error body is the error document, with `code`, `message` and `exit`. A streamed (`application/x-ndjson`) call that fails before its first line answers with the error's own status and JSON body. `HttpApiOptions.port` makes the `Host` check require that port; `serve-api` sets it. `Authorization: bearer` is matched case-insensitively. `serve-api` prints a `curl` line that keeps the token out of the process list.
  - `App.call` returns `code` on an error result. Its error text and the notes it captures have terminal controls removed.
- 9616994: A CLI can now be declared as a tree of commands. The new `@osdlc/cli-tool/command` entry has `defineCommand`, `defineGroup`, `commandKit` (for typed global flags) and `defineApp`. Each command declares its flags, arguments and a Zod output once. The app routes the command line, prints the output as text, or under `--json` as one document that starts with `schemaVersion` and `kind`, and adds `help` (with `--depth`, `--full`, `--all` and a JSON form), `schema` (each command's input and output JSON Schema), `--help` on every command and `--version`. `loadCommandTree` builds the tree from a directory of command files. Zod is a peer dependency of these entries; the root entry still does not load it.
  
  Shared commands: `@osdlc/cli-tool/config-command` (`configCommands(store)`), `@osdlc/cli-tool/trust-command` (`trustCommand(service)`) and `@osdlc/cli-tool/guide` (`guideCommand(topics, { title })`). Each takes the tool's own store, trust service or topics. `@osdlc/cli-tool/testing` has `runApp`, `checkApp` and `checkGuide` for a tool's tests. All of these are experimental.
  
  Every command's context has `ctx.globals`, the app's global flags (such as `-C <dir>`), parsed once before the command runs. A command may throw a `UsageError`, a `CommandError`, a classified failure or any other error; each prints one line on stderr with terminal controls removed, and a plain `Error` exits 1. A group with no default, run with no command word, is a usage error. Under `--json` or `--output jsonl`, a failure prints one error document on stdout, `{ schemaVersion, kind: 'error', code, message, exit, hint? }`, as well as the message on stderr. `ErrorDocument`, `ErrorDocumentSchema` and `errorDocument()` describe it, and `CommandError` takes a `code` (a `UsageError` is `'usage'`). The `kind` and `schemaVersion` of a document always come from the command, whatever the output object holds.
  
  Checks when the app is declared: a flag may not reuse a built-in name (`help`, `json`, `output`, `version`) or the short `-h`, two flags may not share a short letter across the globals and a command, exit codes 22-25 are reserved, and an `items` element must be an object, or a union of objects, none of which declares `schemaVersion` or `kind`. `loadCommandTree` takes an absolute directory only, skips symbolic links, and refuses a file or directory name that is not a plain word (letters, digits, `-` and `_`).
  
  Shared-command details:
  - `trust --scope` is checked: `TrustService.parseScope` (pass `@osdlc/trust-repo`'s `parseTrustScope`) or a default check, and `*` is refused; either refusal exits 2. A service with `untrustAll` adds `trust --untrust-all`, whose answer has `action: 'untrust-all'`. `trust --untrust` on a root that policy still trusts says so.
  - `ConfigStore.resolveKey` maps a typed key to its canonical name, so `cliOnlyKeys` cannot be dodged by case or `a[b]` spelling. Without it, keys are compared lowercased with `[x]` read as `.x`. `parseConfigValue` refuses a number that is not finite, such as `1e400`.
  - Text from a repository or a config file is printed with control characters removed.
  - `runApp` runs in a scratch working directory and a scratch home by default, so a test never reads the real `~/.config`. Pass `cwd` and `env` to choose your own. Under `--json` or `--output json` it checks the document against the command's schema, and an error document against `ErrorDocumentSchema`.
  
  The root entry adds `wrapText`, `helpWidth`, `columns`, `colorEnabled` and an optional `CliContext.terminal`, which `processContext()` fills in; the new `@osdlc/cli-tool/wrap` entry has the text helpers alone. `wrapText` keeps list items, `$ ` command lines, tables, headings, quote lines, fenced code and lines ending in `:` as they are. `colorEnabled` uses `@osdlc/ux`'s `detectColorLevel`, now a dependency: a tool's own `--color` flag, passed as `override`, wins; then a non-empty `NO_COLOR` turns color off; then `FORCE_COLOR`, where `0` or `false` turns color off even on a terminal and any other value (`1`, `yes`, `4`, empty) turns it on, in a pipe too; then `TERM=dumb`; then whether stdout is a terminal. cli-tool adds no `--color` flag itself. `defineCli` takes an optional `width`; with it, epilogues are reflowed and help wraps at that width. Without it, help renders as before.
  
  Breaking, for devlink users on macOS: link state moves from `~/Library/Application Support/<tool>/` to `${XDG_CONFIG_HOME:-~/.config}/<tool>/`, the `xdg` convention, and the launcher reads it there. Run `<tool> dev link` again to restore a link, or move the `home` and `history.jsonl` files. Linux paths do not change. The convention is fixed: devlink sets `conventionFromEnv: false`, so a `<TOOL>_CONVENTION` variable does not move the state away from where the launcher reads it. The vendor's `<P>_CONFIG_DIR` and `<P>_ROOT` still move it, and the launcher reads them too. When a link is still in the old macOS place, `dev status` says so and prints the `mv` command that moves it. `runDevCli` on Windows now prints that `<tool> dev` is not available there and exits 1. A committed launcher must be rendered again (`launcherDrift` reports it).

### Patch Changes

- d243a32: A command can name the words it takes after `--` with `rest: { name: 'args' }`. Its usage line then ends in `[-- <args>...]`. Every command still gets those words as `rest`; the declaration only documents them.
  
  `trustCommand` takes `scopeHelp`, the help for `--scope`, so a tool can say which scopes it has.
  
  `config explain` says "no file, environment variable or flag sets it, so the default applies" when only the default sets a key, instead of "default is the highest layer that sets it".
- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
- Updated dependencies [9616994]
  - @osdlc/command-seam@0.12.0
  - @osdlc/ux@0.1.0
  - @osdlc/config-layers@0.7.3

## 0.8.1

### Patch Changes

- Updated dependencies [0cf31de]
  - @osdlc/command-seam@0.11.0

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
