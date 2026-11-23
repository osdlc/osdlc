/**
 * What the standalone CLI checks before it lists a single PR: that `GIT_DIR`
 * and git's other repository variables, when set, find the checkout the run
 * is in; that the tools the run will shell out to exist; that the git remote
 * can be read; and which code host the remote names. Without this check a
 * missing tool would show up only as a failed listing.
 *
 * Only the repository-variable refusal writes its own message. A missing
 * tool, an unreadable remote and a remote that names no repository are the
 * same `Failure`s the libraries report (`@osdlc/typed-git`,
 * `@osdlc/code-host`), so the message is the one the run would have printed
 * after the call failed. `@osdlc/cli-tool` prints them with their exit codes.
 */

import { CommandFailed, which as whichOnPath, type CommandRunner } from '@osdlc/command-seam'
import {
  badRemoteFailure,
  missingToolFailure,
  resolveCodeHost,
  type CodeHostName,
} from '@osdlc/code-host'
import { type Failure } from '@osdlc/result'
import { Git, REPOSITORY_VARS, classifyGitFailure, withoutRepositoryVars } from '@osdlc/typed-git'

import { realOr } from './real-path.ts'
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
  const find = which ?? ((b: string) => whichOnPath(b, { cwd, absolutePathOnly: true }))
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
  // Found as the default runners spawn them: from an absolute PATH entry only.
  const find =
    opts.which ?? ((b: string) => whichOnPath(b, { cwd: opts.cwd, absolutePathOnly: true }))
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

/**
 * The repository `cwd` is in, as its common dir and top level through symlinks, or null when
 * there is none or git cannot say (not installed, say).
 */
function checkoutAt(cwd: string, runner: CommandRunner): string | null {
  const git = new Git(cwd, { runner })
  const common = git.try.gitCommonDir()
  const top = git.try.topLevel()
  if (!common.ok || !top.ok || common.value === null || top.value === null) return null
  return `${realOr(common.value)}\n${realOr(top.value)}`
}

/**
 * The refusal for a run whose git variables name another repository than the checkout it runs
 * in, or null. `GIT_DIR`, `GIT_WORK_TREE` and the rest are read from `env`, the environment the
 * git runner inherits. When one is set, the checkout is found twice: once as given, once without
 * them. The run is refused when only one of the two finds a checkout, or they find different
 * common dirs or top levels: the survey would measure one repository and the update, whose git
 * calls clear these variables, act on another. It goes ahead when both find the same checkout, as
 * they do when a git hook exports the root's own `GIT_DIR`, and when neither finds one (a
 * `--repo` run outside a checkout, or no git at all), which the later checks report on. The top
 * level is compared, not the directory, so a run from a subdirectory goes ahead.
 */
export function repositoryVarsRefusal(
  cwd: string,
  git: CommandRunner,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const set = REPOSITORY_VARS.filter((name) => env[name] !== undefined)
  if (set.length === 0) return null
  if (checkoutAt(cwd, git) === checkoutAt(cwd, withoutRepositoryVars(git))) return null
  const names =
    set.length === 1 ? set[0] : `${set.slice(0, -1).join(', ')} and ${set[set.length - 1]}`
  const [verb, them] = set.length === 1 ? ['is', 'it'] : ['are', 'them']
  return `pr-update runs in a git checkout; ${names} ${verb} set and point${set.length === 1 ? 's' : ''} elsewhere — unset ${them}`
}
