/**
 * How a CLI reports a classified failure: one line on stderr and one exit code
 * from a table every tool built on this package shares.
 *
 * A library below the CLI (`@osdlc/command-seam`, `@osdlc/typed-git`,
 * `@osdlc/typed-gh`, `@osdlc/code-host`) reports a missing tool, a signed-out
 * `gh` or a network failure as a `Failure` from `@osdlc/result`, with a `kind`,
 * a message and a hint. Without this module, each CLI would map those to a
 * message and a number by itself, and two tools would disagree. This is the
 * one place that does it, so `sweep` and `pr-update` both say "gh is not
 * signed in to GitHub. Run `gh auth login`." and both exit 23.
 *
 * Failures are grouped into the categories a script acts on differently, with
 * one code each (the rule "a new distinct exit code for each distinct failure
 * category"):
 *
 * - {@link EXIT_FAILURE.missingTool} (22): a program the run needs is not installed
 *   or cannot be run. Install it.
 * - {@link EXIT_FAILURE.service} (23): a service answered and refused, or its
 *   answer was unusable (not signed in, no token, not found, a certificate
 *   that fails TLS verification, an HTTP error). Fix the credentials or the
 *   name. Retrying will not help.
 * - {@link EXIT_FAILURE.repository} (24): there is no repository, or no usable
 *   remote, to work on. Run it somewhere else, or name one.
 * - {@link EXIT_FAILURE.unreachable} (25): the service could not be reached in
 *   time, or limited the caller. The same command may work later.
 *
 * Every other kind (`exit`, `spawn`, `signal`, ...) is an ordinary failed run
 * and exits {@link EXIT.error}. A test in `@osdlc/pr-update` checks the table
 * against the kind unions of the layers that classify, so a new kind cannot
 * go unnoticed. The four codes are in the tool range ({@link DOMAIN_EXIT_MIN}
 * to {@link DOMAIN_EXIT_MAX}), so a tool numbering its own outcomes avoids 22
 * to 25.
 */

import { describe, isFailure, type Failure } from '@osdlc/result'

import { EXIT } from './exit.ts'
import type { CliContext } from './io.ts'

/** The exit codes of the four failure categories. */
export const EXIT_FAILURE = {
  /** A program the run needs is not installed or cannot be run. */
  missingTool: 22,
  /** A service refused the caller or gave an unusable answer. */
  service: 23,
  /** There is no repository or remote to work on. */
  repository: 24,
  /** The service could not be reached, or limited the caller. Try again later. */
  unreachable: 25,
} as const

/**
 * The exit code for each failure `kind`, across the layers that classify
 * failures. A kind not listed here exits {@link EXIT.error}.
 */
export const FAILURE_EXIT: Readonly<Record<string, number>> = {
  'not-installed': EXIT_FAILURE.missingTool,
  'not-executable': EXIT_FAILURE.missingTool,

  'not-authenticated': EXIT_FAILURE.service,
  'missing-token': EXIT_FAILURE.service,
  'not-found': EXIT_FAILURE.service,
  tls: EXIT_FAILURE.service,
  http: EXIT_FAILURE.service,
  unreadable: EXIT_FAILURE.service,
  unsupported: EXIT_FAILURE.service,

  'not-a-repo': EXIT_FAILURE.repository,
  'no-remote': EXIT_FAILURE.repository,
  'bad-remote': EXIT_FAILURE.repository,
  'bad-cwd': EXIT_FAILURE.repository,

  network: EXIT_FAILURE.unreachable,
  'remote-unreachable': EXIT_FAILURE.unreachable,
  timeout: EXIT_FAILURE.unreachable,
  'rate-limited': EXIT_FAILURE.unreachable,
}

/** The exit code for `failure`: its category's code, else {@link EXIT.error}. */
export function exitCodeFor(failure: Failure): number {
  return Object.hasOwn(FAILURE_EXIT, failure.kind) ? FAILURE_EXIT[failure.kind]! : EXIT.error
}

/**
 * The failure a thrown value carries, or `null` for any other error. A
 * `FailureError` (and so a `CommandFailed`) carries one on `failure`. A bare
 * thrown `Failure` counts too.
 */
export function failureOf(thrown: unknown): Failure | null {
  if (isFailure(thrown)) return thrown
  if (typeof thrown === 'object' && thrown !== null) {
    const carried = (thrown as { failure?: unknown }).failure
    if (isFailure(carried)) return carried
  }
  return null
}

/**
 * The one line a CLI prints for a failure: `<name>: <message> <hint>`, with a
 * newline. Only the message and hint show. The raw `detail` is left to a
 * caller that wants it, since this package has no verbose switch of its own.
 */
export function renderFailure(failure: Failure, name?: string): string {
  const line = describe(failure)
  return `${name === undefined || name === '' ? line : `${name}: ${line}`}\n`
}

/**
 * Report `failure` on stderr and return its exit code, for a `main` that has a
 * `Result` in hand and would rather return than throw:
 *
 * ```ts
 * const listed = host.listPrs({})
 * if (!listed.ok) return failWith(ctx, listed.error, { name: 'sweep' })
 * ```
 */
export function failWith(
  ctx: Pick<CliContext, 'io'>,
  failure: Failure,
  options: { name?: string | undefined } = {},
): number {
  ctx.io.stderr(renderFailure(failure, options.name))
  return exitCodeFor(failure)
}
