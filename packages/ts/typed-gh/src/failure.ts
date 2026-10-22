/**
 * {@link GhFailure}: a failed `gh` call, classified. The `gh.try.*` door
 * returns it as the error of a `Result`; its `cause` is the `CommandFailed`
 * it was read from.
 *
 * The kinds beyond the subprocess layer's come from `gh`'s stderr, matched in
 * English. A message that matches none stays the subprocess layer's `exit`
 * with `gh`'s first stderr line, never a wrong kind.
 */

import { classifyFailure, type CommandFailed, type CommandFailureKind } from '@osdlc/command-seam'
import { type Failure } from '@osdlc/result'

/**
 * Why a `gh` call failed:
 *
 * - everything `@osdlc/command-seam` reports (`not-installed`, `not-executable`,
 *   `bad-cwd`, `timeout`, `output-cap`, `signal`, `aborted`, `spawn`, `exit`);
 * - `not-authenticated`: `gh` has no usable credentials, or GitHub refused
 *   them ("gh auth login", "HTTP 401", "HTTP 403", "Bad credentials"). A 403 that
 *   is a rate limit stays `rate-limited`;
 * - `network`: GitHub could not be reached ("error connecting to
 *   api.github.com", "Could not resolve host", "dial tcp", "i/o timeout");
 * - `not-found`: GitHub has no such thing, or hides it ("Could not resolve to a
 *   PullRequest", "HTTP 404", "no pull requests found for branch");
 * - `rate-limited`: "API rate limit exceeded", "secondary rate limit", "HTTP 429";
 * - `unreadable`: `gh` exited 0 but its output could not be read completely
 *   (malformed JSON, a partial GraphQL answer, a review-thread list cut short).
 */
export type GhFailureKind =
  CommandFailureKind | 'not-authenticated' | 'network' | 'not-found' | 'rate-limited' | 'unreadable'

/** A failed `gh` call. `message` is one line for a person; `detail` is `gh`'s own output. */
export interface GhFailure extends Failure<GhFailureKind> {
  /** The binary that ran (`gh`), when known. */
  binary?: string | undefined
  /** The arguments `gh` ran with, without the binary name. */
  argv: string[]
  /** `gh`'s exit code; `null` when it never reported one. */
  exitCode: number | null
  /** The signal that ended `gh`, when the runner knows it. */
  signal?: NodeJS.Signals | null | undefined
  /** The `CommandFailed` this was classified from; absent for `unreadable`, where `gh` succeeded. */
  cause?: CommandFailed | undefined
}

const INSTALL_HINT = 'Install it from https://cli.github.com, then run `gh auth login`.'

const RATE_LIMITED = /API rate limit exceeded|secondary rate limit|rate limit exceeded|HTTP 429/i
const NOT_AUTHENTICATED =
  /gh auth login|HTTP 401|HTTP 403|Bad credentials|authentication required|not logged in/i
const NETWORK =
  /error connecting to|Could not resolve host|no such host|dial tcp|i\/o timeout|network is unreachable|connection refused/i
const NOT_FOUND =
  /Could not resolve to an? [A-Za-z]+|HTTP 404|no pull requests found for branch|\(HTTP 404\)|Not Found/

/** What a verb that reads one thing asks GitHub for. */
export type Thing = 'pr' | 'issue' | 'repo'

const ABSENT: Record<Thing, RegExp> = {
  pr: /Could not resolve to a PullRequest|no pull requests found for branch/,
  issue: /Could not resolve to an Issue/,
  repo: /Could not resolve to a Repository/,
}

/**
 * Whether the text of a failed `gh` run (stderr then stdout, as
 * {@link classifyGhFailure} reads it) means "there is no such `thing`", for a
 * verb that reads one thing: an answer, not a failure.
 *
 * Narrower than the `not-found` failure kind on purpose. A mistyped `--repo`
 * makes `gh pr view 7` say "Could not resolve to a Repository", which is a
 * wrong repository rather than a missing pull request, so it is a `not-found`
 * failure and not absence. Likewise a bare `HTTP 404` does not say which part
 * of the request was missing.
 */
export function isAbsent(thing: Thing, text: string): boolean {
  return ABSENT[thing].test(text)
}

/** The gh failure for a failed `gh` run. */
export function classifyGhFailure(failed: CommandFailed): GhFailure {
  // The client's runner may not name its binary; this is gh either way, so the
  // messages say `gh` rather than "The command".
  const f =
    failed.binary === undefined
      ? (classifyFailure(failed.result, { binary: 'gh', argv: failed.argv }) ?? failed.failure)
      : failed.failure
  const base = { ...f, cause: failed }
  if (f.kind === 'not-installed') return { ...base, hint: INSTALL_HINT }
  if (f.kind !== 'exit') return base

  const text = `${failed.result.stderr}\n${failed.result.stdout}`
  if (RATE_LIMITED.test(text)) {
    return {
      ...base,
      kind: 'rate-limited',
      message: "GitHub's API rate limit was reached.",
      hint: 'Wait a few minutes and try again.',
    }
  }
  if (NOT_AUTHENTICATED.test(text)) {
    return {
      ...base,
      kind: 'not-authenticated',
      message: 'gh is not signed in to GitHub.',
      hint: 'Run `gh auth login`.',
    }
  }
  if (NETWORK.test(text)) {
    return {
      ...base,
      kind: 'network',
      message: 'GitHub could not be reached.',
      hint: 'Check your network connection.',
    }
  }
  if (NOT_FOUND.test(text)) {
    return {
      ...base,
      kind: 'not-found',
      message: 'GitHub has no such pull request, issue or repository, or you cannot see it.',
      hint: 'Check the number or name, and that your account can see the repository.',
    }
  }
  return base
}

/** The failure for a run that exited 0 but whose output the verb could not read. */
export function unreadableFailure(
  argv: readonly string[],
  stdout: string,
  binary: string | undefined,
): GhFailure {
  return {
    kind: 'unreadable',
    message: 'gh answered, but its output could not be read completely.',
    ...(stdout.trim() === '' ? {} : { detail: stdout.trim().slice(0, 2000) }),
    binary: binary ?? 'gh',
    argv: [...argv],
    exitCode: 0,
  }
}
