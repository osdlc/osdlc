/**
 * Classify a finished run as a {@link CommandFailure}: a `kind` to branch on and
 * a message for people. The kinds come from the run's `reason` and, for a
 * failed spawn, from the error text the runner recorded (`spawn gh ENOENT`).
 */

import { type Failure } from '@osdlc/result'

import { failureText, firstLine } from './result.ts'
import type { NeverExitedReason } from './sync.ts'

/**
 * Why a command did not succeed:
 *
 * - `not-installed`: the binary is not on `PATH` (spawn `ENOENT`).
 * - `not-executable`: the binary exists but cannot be run (`EACCES`, `EPERM`,
 *   `ENOEXEC`).
 * - `bad-cwd`: the working directory is missing, not a directory, or cannot be entered.
 * - `timeout`: `timeoutMs` ran out and the runner killed the child.
 * - `output-cap`: the child wrote more than `maxOutputBytes` and was killed.
 * - `signal`: a signal from elsewhere ended the child.
 * - `aborted`: the caller stopped it (an `AbortSignal`, `kill()`).
 * - `spawn`: any other failure to start, such as `EBADF` or `E2BIG`.
 * - `exit`: the child ran and exited with a code that is not accepted.
 */
export type CommandFailureKind =
  | 'not-installed'
  | 'not-executable'
  | 'bad-cwd'
  | 'timeout'
  | 'output-cap'
  | 'signal'
  | 'aborted'
  | 'spawn'
  | 'exit'

/** A failed run, classified. `message` is one line for a person. `detail` is the full output. */
export interface CommandFailure extends Failure<CommandFailureKind> {
  /** The binary that ran, when known. */
  binary?: string | undefined
  /** The arguments the command ran with, without the binary name. */
  argv: string[]
  /** The child's own exit code, or `null` when it never reported one. */
  exitCode: number | null
  /** The signal that ended the child, when the runner knows it. */
  signal?: NodeJS.Signals | null | undefined
}

/** What {@link classifyFailure} reads: any runner's result. */
export interface ClassifiableRun {
  exitCode: number
  stdout?: string | Buffer | undefined
  stderr?: string | undefined
  neverExited?: boolean | undefined
  reason?: NeverExitedReason | undefined
  signal?: NodeJS.Signals | null | undefined
  error?: string | undefined
}

/** Context for {@link classifyFailure}. */
export interface ClassifyContext {
  /** The binary that ran. Named in the messages. */
  binary?: string | undefined
  /** The arguments the command ran with. Default `[]`. */
  argv?: readonly string[] | undefined
  /** Exit codes that count as success. Default `[0]`. A run that never exited is never a success. */
  okExitCodes?: readonly number[] | undefined
}

/**
 * The {@link CommandFailure} for a finished run, or `null` when it succeeded:
 * it exited, with a code in `okExitCodes` (default `[0]`).
 *
 * Takes the result of any runner: a capture runner's `CommandResult`, a
 * `StreamResult` or a `ManagedProcessExit`. A missing binary and a missing
 * `cwd` both fail the spawn, and the runner's error text tells them apart.
 *
 * @example
 * ```ts
 * const r = spawnRunner('gh').run(['--version'], { cwd: '.' })
 * const failure = classifyFailure(r, { binary: 'gh', argv: ['--version'] })
 * if (failure?.kind === 'not-installed') console.error(failure.message)
 * ```
 */
export function classifyFailure(
  result: ClassifiableRun,
  context: ClassifyContext = {},
): CommandFailure | null {
  const ok = context.okExitCodes ?? [0]
  if (result.neverExited !== true && ok.includes(result.exitCode)) return null
  return buildFailure(result, context)
}

/** The failure for a run known to have failed. */
export function buildFailure(result: ClassifiableRun, context: ClassifyContext): CommandFailure {
  const { binary } = context
  const subject = binary === undefined ? 'The command' : `\`${binary}\``
  const base = {
    binary,
    argv: [...(context.argv ?? [])],
    exitCode: result.neverExited === true ? null : result.exitCode,
    ...(result.signal === undefined ? {} : { signal: result.signal }),
  }
  const error = result.error ?? ''
  const detail = error === '' ? undefined : error
  const make = (kind: CommandFailureKind, message: string, extra?: string): CommandFailure => ({
    kind,
    message,
    ...(extra === undefined ? {} : { detail: extra }),
    ...base,
  })

  if (result.neverExited === true) {
    switch (result.reason) {
      case 'spawn':
        return spawnFailure(error, subject, make)
      case 'timeout':
        return make('timeout', `${subject} timed out and was stopped.`, detail)
      case 'output':
        return make(
          'output-cap',
          `${subject} wrote more output than allowed and was stopped.`,
          detail,
        )
      case 'abort':
        return make('aborted', `${subject} was stopped before it finished.`, detail)
      case 'signal':
        return make(
          'signal',
          result.signal
            ? `${subject} was ended by ${result.signal}.`
            : `${subject} was ended by a signal.`,
          detail,
        )
      default:
        return make('spawn', `${subject} did not run.`, detail)
    }
  }

  const full = failureText(withStreams(result), { both: true })
  const first = firstLine(failureText(withStreams(result)), `exit ${result.exitCode}`)
  return make('exit', first, full === '' ? undefined : full)
}

function spawnFailure(
  error: string,
  subject: string,
  make: (kind: CommandFailureKind, message: string, detail?: string) => CommandFailure,
): CommandFailure {
  const detail = error === '' ? undefined : error
  // The cwd check comes first: its text also says ENOENT.
  if (/: cwd /.test(error)) {
    const dir = /cwd ("(?:[^"\\]|\\.)*")/.exec(error)?.[1]
    if (/\bEACCES: cwd /.test(error)) {
      return make(
        'bad-cwd',
        dir === undefined
          ? 'The working directory cannot be entered: permission denied.'
          : `The working directory ${dir} cannot be entered: permission denied.`,
        detail,
      )
    }
    return make(
      'bad-cwd',
      dir === undefined
        ? 'The working directory is missing or is not a directory.'
        : `The working directory ${dir} is missing or is not a directory.`,
      detail,
    )
  }
  if (/\bENOENT\b/.test(error)) {
    return make('not-installed', `${subject} is not installed or not on PATH.`, detail)
  }
  if (/\b(EACCES|EPERM|ENOEXEC)\b/.test(error)) {
    return make(
      'not-executable',
      `${subject} cannot be run: permission denied or not an executable.`,
      detail,
    )
  }
  return make('spawn', `${subject} could not be started.`, detail)
}

function withStreams(result: ClassifiableRun): {
  exitCode: number
  stdout: string
  stderr: string
  error: string | undefined
} {
  return {
    exitCode: result.exitCode,
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  }
}
