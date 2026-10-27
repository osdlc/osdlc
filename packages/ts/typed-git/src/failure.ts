/**
 * {@link GitFailure}: a failed git call, classified. `git.try.*` returns it
 * as the error of a `Result`. Its `cause` is the `CommandFailed` it was read
 * from.
 *
 * The git-specific kinds come from git's stderr, matched in English. Under a
 * non-English locale git translates its messages. Those keep command-seam's
 * kind, so an unrecognised failure is still an `exit` with git's first stderr
 * line as its message, never a wrong git kind.
 */

import {
  classifyFailed,
  isCommandFailed,
  type CommandFailed,
  type CommandFailureKind,
} from '@osdlc/command-seam'
import { describe, FailureError, isFailure, type Failure } from '@osdlc/result'

/**
 * Why a git call failed:
 *
 * - everything `@osdlc/command-seam` reports (`not-installed`, `not-executable`,
 *   `bad-cwd`, `timeout`, `output-cap`, `signal`, `aborted`, `spawn`, `exit`);
 * - `not-a-repo`: git ran outside a repository ("not a git repository");
 * - `no-remote`: the named remote does not exist ("No such remote", "'x' does not
 *   appear to be a git repository");
 * - `remote-unreachable`: the remote exists but could not be reached ("Could not
 *   read from remote repository", "Could not resolve host", "unable to access"
 *   without an HTTP status: a refused connection, a timeout);
 * - `not-authenticated`: the remote refused the credentials ("Authentication
 *   failed", "Permission denied (publickey)", "could not read Username", "unable
 *   to access … The requested URL returned error: 401" or "403");
 * - `not-found`: the host answered that the repository is not there ("unable to
 *   access … The requested URL returned error: 404"). Retrying will not help;
 * - `tls`: the TLS handshake failed ("unable to access … SSL certificate
 *   problem"). The host was reached, so this is not `remote-unreachable`, and
 *   retrying will not help until the clock, the CA certificates or the remote's
 *   certificate is fixed.
 */
export type GitFailureKind =
  | CommandFailureKind
  | 'not-a-repo'
  | 'no-remote'
  | 'remote-unreachable'
  | 'not-authenticated'
  | 'not-found'
  | 'tls'

/** A failed git call. `message` is one line for a person; `detail` is git's own output. */
export interface GitFailure extends Failure<GitFailureKind> {
  /** The binary that ran (`git`), when the runner reports one. */
  binary?: string | undefined
  /** The arguments git ran with, without the binary name. */
  argv: string[]
  /** git's exit code; `null` when it never reported one. */
  exitCode: number | null
  /** The signal that ended git, when the runner knows it. */
  signal?: NodeJS.Signals | null | undefined
  /** The `CommandFailed` this was classified from. */
  cause: CommandFailed
}

const INSTALL_HINT = 'Install git from https://git-scm.com.'

/** The git failure for a failed `git` run. */
export function classifyGitFailure(failed: CommandFailed): GitFailure {
  // The client's runner may not name its binary; this is git either way, so
  // the messages say `git` rather than "The command".
  const base = classifyFailed(failed, { binary: 'git', installHint: INSTALL_HINT })
  if (base.kind !== 'exit') return base

  // git's own words: stderr, then the stdout some commands explain with.
  const text = `${failed.result.stderr}\n${failed.result.stdout}`
  const remote = /No such remote:? '([^']+)'/.exec(text)?.[1]
  const notARemote = /fatal: '([^']+)' does not appear to be a git repository/.exec(text)?.[1]

  if (/not a git repository/i.test(text)) {
    return {
      ...base,
      kind: 'not-a-repo',
      message: 'This is not a git repository.',
      hint: 'Run it inside a git repository, or create one with `git init`.',
    }
  }
  if (/No such remote/.test(text)) {
    return {
      ...base,
      kind: 'no-remote',
      message:
        remote === undefined
          ? 'That remote does not exist.'
          : `The remote '${remote}' does not exist.`,
      hint: 'List the remotes with `git remote -v`.',
    }
  }
  // "unable to access" with a status means the host answered. A refusal or a
  // wrong URL will not clear up by retrying, so it must not read as unreachable.
  const status = /unable to access[^\n]*returned error: (\d{3})/.exec(text)?.[1]
  if (
    /Authentication failed|Permission denied \(publickey\)|could not read (Username|Password)/i.test(
      text,
    ) ||
    status === '401' ||
    status === '403'
  ) {
    return {
      ...base,
      kind: 'not-authenticated',
      message: 'The remote refused the credentials.',
      hint: 'Check that you are signed in to the host, or that your SSH key is added.',
    }
  }
  if (status === '404') {
    return {
      ...base,
      kind: 'not-found',
      message: 'The remote repository was not found, or you cannot see it.',
      hint: 'Check the remote URL, and that your account can see the repository.',
    }
  }
  if (/unable to access[^\n]*SSL certificate problem|SSL certificate problem/i.test(text)) {
    return {
      ...base,
      kind: 'tls',
      message: "The remote's TLS certificate could not be verified.",
      hint: "Check the system clock and CA certificates, or the remote's certificate.",
    }
  }
  if (notARemote !== undefined) {
    return {
      ...base,
      kind: 'no-remote',
      message: `The remote '${notARemote}' does not exist or is not a git repository.`,
      hint: 'List the remotes with `git remote -v`.',
    }
  }
  if (/Could not read from remote repository|Could not resolve host|unable to access/.test(text)) {
    return {
      ...base,
      kind: 'remote-unreachable',
      message: 'The remote could not be reached.',
      hint: 'Check your network connection and the remote URL.',
    }
  }
  return base
}

/** The git verb a failure ran, past any leading `-c <k=v>` / `-C <dir>` options (other global options are expected in their `--opt=value` form); `undefined` when argv has none. */
function gitVerb(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '-c' || arg === '-C') i++
    else if (!arg.startsWith('-')) return arg
  }
  return undefined
}

/**
 * One line for a person that names the git command: `git <verb>: <message>`,
 * then the hint when there is one. The classified `message` alone does not say
 * which command failed, so use this when the failure reaches a log or a status
 * file without its surrounding code.
 */
export function describeGitFailure(failure: GitFailure): string {
  const verb = gitVerb(failure.argv)
  const line = describe(failure)
  return verb === undefined ? `git: ${line}` : `git ${verb}: ${line}`
}

/**
 * What the throwing methods throw for a failed git call: a `FailureError`
 * carrying the {@link GitFailure} that {@link classifyGitFailure} reads from
 * it, with the `CommandFailed` as its `cause`. Its `message` is
 * {@link describeGitFailure}, so it names the command that failed. Any other
 * value is returned unchanged. The git kind (a signed-out remote, an
 * unreachable one) lets a CLI that reports a thrown failure pick an exit code
 * for it. A bare `CommandFailed` has only command-seam's kinds.
 */
export function gitFailureError(error: unknown): unknown {
  if (!isCommandFailed(error)) return error
  const failure = classifyGitFailure(error)
  // FailureError's message is the bare sentence. Add the command to it.
  const thrown = new FailureError(failure)
  thrown.message = describeGitFailure(failure)
  return thrown
}

/**
 * The failure a thrown value carries, recognised by shape so two installed
 * copies of command-seam or result agree; `null` for any other throw. A bare
 * `CommandFailed` is classified here.
 */
export function thrownGitFailure(error: unknown): GitFailure | null {
  if (isCommandFailed(error)) return classifyGitFailure(error)
  if (typeof error === 'object' && error !== null) {
    const carried = (error as { failure?: unknown }).failure
    if (isFailure(carried)) return carried as GitFailure
  }
  return null
}
