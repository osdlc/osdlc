# @osdlc/cli-tool

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
