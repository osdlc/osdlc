/**
 * `@osdlc/detect-harness`: find the coding-agent harnesses on a machine and in
 * a project, and read what each has configured.
 *
 * `./model` (experimental) reads one plugin folder.
 *
 * The package only reads. It never writes a harness's files, and it runs a
 * program only with `allowExec`.
 */

export { detect, parseVersion, selectProviders } from './detect.ts'
export type {
  DetectOptions,
  DirEntry,
  HarnessProvider,
  JsonRead,
  ProviderContext,
  ProviderKind,
  ProviderResult,
  TextRead,
} from './contract.ts'
export { builtinProviders } from './providers/index.ts'
export { current, type CurrentHarness } from './current.ts'
export { which } from './which.ts'
export {
  BUILTIN_HARNESSES,
  HARNESS_ALIASES,
  harnessId,
  type BuiltinHarnessId,
} from './harnesses.ts'
export * from './locations.ts'
export * from './report.ts'
export { REDACTED } from './read/redact.ts'
export { codexHookHash, snakeEvent } from './read/hooks.ts'
