/**
 * `@osdlc/command-seam`: run external commands through a small interface
 * that tests can replace.
 *
 * A runner is an object with a `run` method. Code that needs a command takes
 * a runner as a parameter. Production passes a real one; tests pass a fake.
 *
 * - `spawnRunner` / `spawnRunnerAsync` capture a finished run's output
 *   ({@link CommandResult}). `spawnRunnerBytes` / `spawnRunnerBytesAsync`
 *   return stdout as raw bytes.
 * - `runShell` / `shellRunner` run a shell string through `sh -c --`.
 * - `streamRunner` runs with inherited stdio, so output appears live, or
 *   with stdio sent to `/dev/null` or to file descriptors.
 * - `managedProcessRunner` starts a process and returns a handle to it
 *   without waiting for it to finish. `stopProcess` stops it with a grace
 *   period.
 * - `withDefaults` binds default options to any of them.
 * - `which` finds a binary on `PATH` without running it.
 *
 * The capture runners share {@link CommandResult}, {@link CommandRunOptions}
 * and {@link CommandFailed}, so one {@link isCommandFailed} check covers
 * the sync and async forms.
 */

export {
  catchFailed,
  CommandFailed,
  isCommandFailed,
  mapFailed,
  resolveRunner,
  runChecked,
  spawnRunner,
  spawnRunnerBytes,
  type BytesCommandRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
  type EnvOverrides,
  type NeverExitedReason,
  type SpawnRunnerOptions,
  type StdioOption,
} from './sync.ts'

export {
  asAsync,
  catchFailedAsync,
  mapFailedAsync,
  resolveRunnerAsync,
  runCheckedAsync,
  spawnRunnerAsync,
  spawnRunnerBytesAsync,
  type AsyncBytesCommandRunner,
  type AsyncCommandRunner,
  type AsyncCommandRunOptions,
} from './async.ts'

export {
  failureText,
  firstLine,
  isJsonParseFailure,
  parseJsonResult,
  ran,
  runJson,
  runJsonAsync,
  stderrOrError,
  type FailureTextOptions,
  type JsonFailure,
  type JsonRun,
  type RunJsonOptions,
} from './result.ts'

export {
  classifyFailure,
  type ClassifiableRun,
  type ClassifyContext,
  type CommandFailure,
  type CommandFailureKind,
} from './failure.ts'

export { shellJoin, shellQuote } from './quote.ts'

export {
  runShell,
  runShellAsync,
  shellRunner,
  shellRunnerAsync,
  type AsyncShellRunner,
  type AsyncShellRunOptions,
  type ShellRunner,
  type ShellPositionals,
  type ShellRunOptions,
} from './shell.ts'

export {
  streamRunner,
  type StreamRunner,
  type StreamRunOptions,
  type StreamResult,
} from './stream.ts'

export {
  managedProcessRunner,
  stopProcess,
  type ManagedProcessRunner,
  type ManagedProcessHandle,
  type ManagedProcessRunOptions,
  type ManagedProcessExit,
} from './process.ts'

export {
  forwardedExitCode,
  forwardedSignal,
  installGroupSignalForwarding,
  liveProcessGroups,
  type GroupSignalForwardingOptions,
} from './groups.ts'

export { withDefaults, type DefaultedRunner } from './defaults.ts'

export {
  absolutePathCandidates,
  which,
  type PathCandidateOptions,
  type WhichOptions,
} from './which.ts'
