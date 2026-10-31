/**
 * `@osdlc/cli-tool`: what a standalone CLI needs before it does anything of
 * its own.
 *
 * This is the root entry: the {@link CliIo} output interface, the
 * {@link CliContext} a `main` receives, the exit-code rule, the
 * {@link defineCli} flag declaration, help wrapping, and {@link runMain} for
 * the shim. The other entries build on it:
 *
 *   - `@osdlc/cli-tool/command`: a CLI as a tree of declared commands, with
 *     help, `schema`, `--json` and `--version` generated from it.
 *   - `/config-command`, `/trust-command`, `/guide`: shared commands.
 *   - `/testing`: running an app in process, and shared checks.
 *   - `/devlink`: running a system-installed tool from a development checkout.
 *
 * A tool's config files live in `@osdlc/config-layers`. The directory and
 * did-you-mean helpers it shares with this package are re-exported below.
 *
 * Nothing here touches a `Bun.*` global. A published CLI's bin runs under
 * node, and this is imported by every one of them.
 */

export { captureContext, captureIo, colorEnabled, processContext, processIo } from './io.ts'
export type { CliContext, CliIo, Terminal } from './io.ts'

export { DOMAIN_EXIT_MAX, DOMAIN_EXIT_MIN, EXIT, isDomainExit } from './exit.ts'
export type { ExitCode } from './exit.ts'

export {
  EXIT_FAILURE,
  FAILURE_EXIT,
  exitCodeFor,
  failWith,
  failureOf,
  renderError,
  renderFailure,
} from './failure.ts'

export { defineCli } from './define-cli.ts'
export type {
  BooleanFlag,
  Cli,
  CliDecl,
  CountFlag,
  EnumFlag,
  FlagDecl,
  FlagSpec,
  FlagValues,
  ListFlag,
  ParseResult,
  PositionalDecl,
  StringFlag,
  TristateFlag,
} from './define-cli.ts'

export { envVars, systemDirs, TieredDirs } from '@osdlc/config-layers/dirs'
export { closestMatches, didYouMean } from '@osdlc/config-layers/did-you-mean'
export type { EnvVars, ResolveOptions, VendorDirs } from '@osdlc/config-layers/dirs'
export { askYesNo, canPrompt, isYes, readLine } from './prompt.ts'
export type { AskYesNoOptions } from './prompt.ts'

export { DEFAULT_WIDTH, MAX_WIDTH, columns, helpWidth, wrapText } from './wrap.ts'

export { runMain } from './run-main.ts'
export type { DevlinkHook, DevlinkWhere, MainFn, RunMainOptions } from './run-main.ts'
