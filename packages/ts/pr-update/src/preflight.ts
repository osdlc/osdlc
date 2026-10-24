/**
 * What the standalone CLI checks before it lists a single PR: that the tools
 * the run will shell out to exist, that the git remote can be read, and which
 * code host the remote names. Without this check a missing tool would show up
 * only as a failed listing.
 *
 * Nothing here writes its own failure message. A missing tool, an unreadable
 * remote and a remote that names no repository are the same `Failure`s the
 * libraries report (`@osdlc/typed-git`, `@osdlc/code-host`), so the message is
 * the one the run would have printed after the call failed. `@osdlc/cli-tool`
 * prints them with their exit codes.
 */

import { CommandFailed, which as whichOnPath, type CommandRunner } from '@osdlc/command-seam'
import {
  badRemoteFailure,
  missingToolFailure,
  resolveCodeHost,
  type CodeHostName,
} from '@osdlc/code-host'
import { type Failure } from '@osdlc/result'
import { classifyGitFailure } from '@osdlc/typed-git'

import { remoteSlug } from './survey.ts'

/** Finds a binary on `PATH`; a test substitutes one. */
export type WhichSeam = (binary: string) => string | undefined

/** The `not-installed` failure for `git`, worded by `@osdlc/typed-git`. */
function gitMissing(): Failure {
  return classifyGitFailure(
    new CommandFailed(
      ['--version'],
      {
        exitCode: 1,
        stdout: '',
        stderr: '',
        neverExited: true,
        reason: 'spawn',
        error: 'spawn git ENOENT',
      },
      'git',
    ),
  )
}

/** The failure for a run whose `git` is not installed, or null when it is. */
export function gitMissingFailure(cwd: string, which?: WhichSeam | undefined): Failure | null {
  const find = which ?? ((b: string) => whichOnPath(b, { cwd }))
  return find('git') === undefined ? gitMissing() : null
}

/**
 * Check, in order: `git` is installed; the code host the remote names (or the
 * `code_host.override`) and its tool (`gh` for GitHub, `curl` for Forgejo) are
 * installed; and, when no `--repo` names another repository, the remote can be
 * read and names a repository. Returns the first problem, or null.
 */
export function preflight(opts: {
  cwd: string
  git: CommandRunner
  remote: string
  /** True when `--repo` named repositories, so the local remote is not needed. */
  repoGiven: boolean
  override: CodeHostName | null
  which?: WhichSeam | undefined
}): Failure | null {
  const find = opts.which ?? ((b: string) => whichOnPath(b, { cwd: opts.cwd }))
  if (find('git') === undefined) return gitMissing()
  const { name } = resolveCodeHost(opts.cwd, opts.git, opts.override)
  if (find(name === 'github' ? 'gh' : 'curl') === undefined) return missingToolFailure(name)
  if (opts.repoGiven) return null

  const argv = ['remote', 'get-url', opts.remote]
  const res = opts.git.run(argv, { cwd: opts.cwd })
  if (res.neverExited === true || res.exitCode !== 0) {
    return classifyGitFailure(new CommandFailed(argv, res, 'git'))
  }
  const url = res.stdout.trim().split('\n')[0] ?? ''
  return remoteSlug(url) === null ? badRemoteFailure(name, opts.remote, url) : null
}
