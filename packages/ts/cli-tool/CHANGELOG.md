# @osdlc/cli-tool

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
