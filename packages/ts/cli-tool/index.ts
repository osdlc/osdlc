/**
 * `@osdlc/cli-tool` — what a standalone CLI needs before it does anything
 * of its own.
 *
 * Three entries, because a tool reaches for all three at once and splitting
 * them bought three manifests rather than three ideas:
 *
 *   - this one, the CLI substrate: the {@link CliIo} output seam, the
 *     {@link CliContext} a `main` is handed, the exit-code rule, the
 *     {@link defineCli} flag declaration, and {@link runMain} for the shim.
 *   - `@osdlc/cli-tool/devlink` — running a system-installed tool from a
 *     development checkout.
 *   - `@osdlc/cli-tool/trust` — the trust policy and the exec gate.
 *
 * A tool's config files live in `@osdlc/config-layers`. The directory and
 * did-you-mean helpers it shares with this package are re-exported below.
 *
 * Nothing here touches a `Bun.*` global. A published CLI's bin runs under
 * node, and this is imported by every one of them.
 */

export { captureContext, captureIo, processContext, processIo } from './io.ts'
export type { CliContext, CliIo } from './io.ts'

export { DOMAIN_EXIT_MAX, DOMAIN_EXIT_MIN, EXIT, isDomainExit } from './exit.ts'
export type { ExitCode } from './exit.ts'

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

export { closestMatches, didYouMean, envVars, systemDirs, TieredDirs } from '@osdlc/config-layers'
export type { EnvVars, ResolveOptions, VendorDirs } from '@osdlc/config-layers'
export { askYesNo, canPrompt, isYes, readLine } from './prompt.ts'
export type { AskYesNoOptions } from './prompt.ts'

export { runMain } from './run-main.ts'
export type { MainFn, RunMainOptions } from './run-main.ts'
