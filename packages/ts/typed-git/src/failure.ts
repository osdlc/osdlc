/**
 * {@link GitFailure}: a failed git call, classified. The `git.try.*` door
 * returns it as the error of a `Result`; its `cause` is the `CommandFailed`
 * it was read from.
 *
 * The git-specific kinds come from git's stderr, matched in English. Git
 * translates its messages under a non-English locale; those fall through to the
 * subprocess layer's kind, so an unrecognised failure is still an `exit` with
 * git's first stderr line as its message, never a wrong git kind.
 */

import { classifyFailure, type CommandFailed, type CommandFailureKind } from '@osdlc/command-seam'
import { type Failure } from '@osdlc/result'

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
 *   access … The requested URL returned error: 404"). Retrying will not help.
 */
export type GitFailureKind =
  | CommandFailureKind
  | 'not-a-repo'
  | 'no-remote'
  | 'remote-unreachable'
  | 'not-authenticated'
  | 'not-found'

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
  const f =
    failed.binary === undefined
      ? (classifyFailure(failed.result, { binary: 'git', argv: failed.argv }) ?? failed.failure)
      : failed.failure
  const base = { ...f, cause: failed }
  if (f.kind === 'not-installed') return { ...base, hint: INSTALL_HINT }
  if (f.kind !== 'exit') return base

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
  if (
    /Authentication failed|Permission denied \(publickey\)|could not read (Username|Password)/i.test(
      text,
    )
  ) {
    return {
      ...base,
      kind: 'not-authenticated',
      message: 'The remote refused the credentials.',
      hint: 'Check that you are signed in to the host, or that your SSH key is added.',
    }
  }
  // "unable to access" with a status means the host answered. A refusal or a
  // wrong URL will not clear up by retrying, so it must not read as unreachable.
  const status = /unable to access[^\n]*returned error: (\d{3})/.exec(text)?.[1]
  if (status === '401' || status === '403') {
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
