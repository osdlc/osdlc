/**
 * How both commands end: their exit codes, the Ctrl-C wiring they share, and
 * how an error that stops a run is reported.
 *
 * The codes follow the osdlc CLI standard (`standards/cli-interface.md`, built
 * into `@osdlc/cli-tool`): 0, 1 and 2 mean what they mean in every osdlc tool,
 * 22 and 24 are the shared "not installed" and "no repository" codes, and 10
 * and 11 are this tool's own
 * outcomes, inside the band the standard leaves to a tool.
 */
import { EXIT, EXIT_FAILURE, exitCodeFor, failureOf } from '@osdlc/cli-tool'

import { ChangesetError, errorText } from './changeset.ts'
import { printJson, say } from './output.ts'
import { ScopeError } from './select.ts'

/** The exit codes of `rule-review` and `rule-review checks`. */
export const EXIT_CODE = {
  /** Clean, advisory, a dry run, or every check passed. */
  ok: EXIT.ok,
  /** Findings at or above the floor with `--blocking`, or a check that failed. */
  failed: EXIT.error,
  /** The command line cannot run as typed. */
  usage: EXIT.usage,
  /** An error stopped the run: a base that does not resolve, an unreadable pattern, a failing provider. */
  notRun: 10,
  /** With `--strict`: a judgement did not complete. */
  incomplete: 11,
  /** `git` is not installed, or cannot be run. */
  missingTool: EXIT_FAILURE.missingTool,
  /** The directory is not inside a git repository, or does not exist. */
  noRepository: EXIT_FAILURE.repository,
  /** SIGINT or SIGTERM: the running agents or check were killed. 128 + SIGINT, as a shell reports it. */
  interrupted: 130,
} as const

/** What an error that stops a run is called in an error document, and its exit code. */
export function classify(err: unknown): { code: string; exit: number } {
  // A program that is not installed (git) carries a classified failure.
  const failure = failureOf(err)
  if (failure !== null && exitCodeFor(failure) === EXIT_CODE.missingTool) {
    return { code: failure.kind, exit: EXIT_CODE.missingTool }
  }
  if (err instanceof ChangesetError) {
    return err.kind === 'not-a-repository'
      ? { code: err.kind, exit: EXIT_CODE.noRepository }
      : { code: err.kind, exit: EXIT_CODE.notRun }
  }
  if (err instanceof ScopeError) return { code: 'bad-pattern', exit: EXIT_CODE.notRun }
  return { code: 'error', exit: EXIT_CODE.notRun }
}

/**
 * Report a failure and return its exit code: `rule-review: <message>` on
 * stderr and, under `--json`, the standard error document on stdout, where
 * a caller reads data. The document is the shape `@osdlc/cli-tool/command`
 * defines, written here so a run does not load that entry and its `zod`.
 */
export function fail(
  err: unknown,
  json: boolean,
  known?: { code: string; exit: number; hint?: string },
): number {
  const { code, exit } = known ?? classify(err)
  const message = errorText(err)
  say(`rule-review: ${message}\n`)
  if (known?.hint !== undefined) say(`${known.hint}\n`)
  if (json) {
    const hint = known?.hint?.trim()
    const doc = { schemaVersion: 1, kind: 'error', code, message, exit }
    printJson(hint === undefined || hint === '' ? doc : { ...doc, hint })
  }
  return exit
}

/** A usage error: the message, and where the help is. */
export function usage(message: string, json: boolean, help: string): number {
  return fail(message, json, { code: 'usage', exit: EXIT_CODE.usage, hint: `See '${help}'.` })
}

/**
 * The first value in `values` that starts with `-`, named by its flag.
 * Commander lets a flag take the next argument whatever it is, so
 * `--base --json` would read `--json` as the ref instead of refusing.
 */
export function flagAsValue(values: Record<string, unknown>, flags: string[]): string | undefined {
  for (const key of flags) {
    const v = values[key]
    for (const item of Array.isArray(v) ? v : [v]) {
      if (typeof item === 'string' && item.startsWith('-')) {
        const flag =
          key === 'dir' ? '-C' : `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
        return `${flag} needs a value (got '${item}')`
      }
    }
  }
  return undefined
}

/**
 * Whether `-h` or `--help` comes before any `--`. Commander checks every
 * flag's value before it acts on help, so `--help --base` would fail instead
 * of printing the help.
 */
export function helpAsked(argv: readonly string[]): boolean {
  for (const arg of argv) {
    if (arg === '--') return false
    if (arg === '-h' || arg === '--help') return true
  }
  return false
}

/** Interrupted: `what` (the running agents, or the running check) was killed. */
export function interrupted(json: boolean, what: string): number {
  return fail(`interrupted; ${what} stopped.`, json, {
    code: 'interrupted',
    exit: EXIT_CODE.interrupted,
  })
}

/**
 * Run `work` with SIGINT and SIGTERM forwarded to the signal it gets. Each
 * agent and check leads its own process group, out of reach of the terminal's
 * Ctrl-C, so the signal has to be forwarded for the children to be killed.
 * The listeners are removed when `work` settles, whichever way.
 */
export async function withInterrupt<T>(
  work: (signal: AbortSignal) => Promise<T>,
): Promise<{ value: T; interrupted: boolean }> {
  const controller = new AbortController()
  const onSignal = () => controller.abort()
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  try {
    const value = await work(controller.signal)
    return { value, interrupted: controller.signal.aborted }
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}
