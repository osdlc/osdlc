/**
 * {@link CodeHostFailure}: a failed call to a code host, classified. The port's
 * fallible methods return it as the error of a `Result`.
 *
 * Both adapters report the same kinds, so a caller (and `@osdlc/cli-tool`'s
 * exit table) handles "not signed in" or "no network" once, whichever host
 * answered. The GitHub adapter passes `@osdlc/typed-gh`'s `GhFailure` through
 * (its `cause`); the Forgejo adapter reads curl's exit code and the HTTP
 * status.
 */

import type { CommandFailureKind } from '@osdlc/command-seam'
import { type Failure } from '@osdlc/result'
import type { GhFailure } from '@osdlc/typed-gh'

import type { CodeHostName } from './types.ts'

/**
 * Why a code host call failed:
 *
 * - every `@osdlc/command-seam` kind (`not-installed`, `not-executable`,
 *   `bad-cwd`, `timeout`, `output-cap`, `signal`, `aborted`, `spawn`, `exit`):
 *   the tool (`gh`, `curl`) did not run, or ran and failed in a way no kind
 *   below names;
 * - `not-authenticated`: the host refused the credentials (`gh` signed out,
 *   HTTP 401 or 403);
 * - `network`: the host could not be reached (DNS, connection refused, TLS);
 * - `not-found`: the host has no such repository, or hides it (HTTP 404);
 * - `rate-limited`: the host's API limit was reached (HTTP 429);
 * - `http`: any other HTTP error status, named in `detail` and `status`;
 * - `unreadable`: the host answered, but the answer could not be read;
 * - `unsupported`: this host has no such feature (Forgejo's review threads);
 * - `no-remote`, `bad-remote`, `missing-token`: {@link selectCodeHost} could not
 *   build an adapter (no `origin` remote, a remote that names no repository,
 *   no Forgejo token).
 */
export type CodeHostFailureKind =
  | CommandFailureKind
  | 'not-authenticated'
  | 'network'
  | 'not-found'
  | 'rate-limited'
  | 'http'
  | 'unreadable'
  | 'unsupported'
  | 'no-remote'
  | 'bad-remote'
  | 'missing-token'

/** A failed code host call. `message` is one line for a person; `detail` is the host's or tool's own output. */
export interface CodeHostFailure extends Failure<CodeHostFailureKind> {
  /** Which host the call was made to. */
  host: CodeHostName
  /** The HTTP status, when the failure is one the host answered. */
  status?: number | undefined
}

/** The failure for a failed `gh` call: typed-gh's classification, with the host and the `GhFailure` as `cause`. */
export function fromGhFailure(failure: GhFailure): CodeHostFailure {
  const { kind, message, hint, detail } = failure
  return {
    kind,
    message,
    ...(hint === undefined ? {} : { hint }),
    ...(detail === undefined ? {} : { detail }),
    host: 'github',
    cause: failure,
  }
}
