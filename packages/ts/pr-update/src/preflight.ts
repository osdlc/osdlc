/**
 * What the standalone CLI checks before it lists a single PR: that the tools
 * the run will shell out to exist, that the git remote can be read, and which
 * code host the remote names. A missing tool otherwise surfaces as a failed
 * listing, which used to read as "no open PRs".
 *
 * Exit codes live here, beside the checks that produce them; `EXIT_UNTRUSTED`
 * (21) is in `trust.ts`. All sit in `@osdlc/cli-tool`'s tool band (10-63).
 */

import { which as whichOnPath, type CommandRunner } from '@osdlc/command-seam'
import { resolveCodeHost, type CodeHostName } from '@osdlc/code-host'
import { Git } from '@osdlc/typed-git'

import { remoteSlug } from './survey.ts'

/** A tool the run needs is not on `PATH`: `git`, and `gh` or `curl` for the chosen host. */
export const EXIT_MISSING_TOOL = 22

/**
 * The code host could not be used: its adapter cannot be built (no Forgejo
 * token, an unparsable remote) or listing its PRs failed (not signed in, no
 * network). Fixing it is a matter of credentials or connectivity, so it is
 * kept apart from a missing tool and from a missing remote.
 */
export const EXIT_CODE_HOST = 23

/** The remote to measure against cannot be read, so there is no repository to survey. */
export const EXIT_NO_REMOTE = 24

/** Finds a binary on `PATH`; a test substitutes one. */
export type WhichSeam = (binary: string) => string | undefined

/** The environment variable the Forgejo token is read from when nothing names another. */
export const FORGEJO_TOKEN_ENV = 'FORGEJO_TOKEN'

/** Why a run cannot start, and the exit code that says so. */
export interface PreflightFailure {
  exit: number
  message: string
}

/** The result of {@link preflight}: the chosen host, or why the run cannot start. */
export type PreflightResult =
  { ok: true; host: CodeHostName } | { ok: false; failure: PreflightFailure }

const MISSING_TOOL_MESSAGES: Record<string, string> = {
  git: 'pr-update needs git on PATH. Install it from https://git-scm.com.',
  gh: 'pr-update needs the GitHub CLI (gh) on PATH to read pull requests. Install it from https://cli.github.com, then run `gh auth login`.',
  curl: 'pr-update needs curl on PATH to talk to Forgejo.',
}

function missingFailure(binary: string): PreflightFailure {
  return { exit: EXIT_MISSING_TOOL, message: MISSING_TOOL_MESSAGES[binary]! }
}

function missing(binary: string): PreflightResult {
  return { ok: false, failure: missingFailure(binary) }
}

/** The failure for a run whose `git` is not installed, or null when it is. */
export function gitMissingFailure(
  cwd: string,
  which?: WhichSeam | undefined,
): PreflightFailure | null {
  const find = which ?? ((b: string) => whichOnPath(b, { cwd }))
  return find('git') === undefined ? missingFailure('git') : null
}

/**
 * Check, in order: `git` is installed; the code host the remote names (or the
 * `code_host.override`) and its tool (`gh` for GitHub, `curl` for Forgejo) are
 * installed; and, when no `--repo` names another repository, the remote can be
 * read.
 */
export function preflight(opts: {
  cwd: string
  git: CommandRunner
  remote: string
  /** True when `--repo` named repositories, so the local remote is not needed. */
  repoGiven: boolean
  override: CodeHostName | null
  which?: WhichSeam | undefined
}): PreflightResult {
  const find = opts.which ?? ((b: string) => whichOnPath(b, { cwd: opts.cwd }))
  if (find('git') === undefined) return missing('git')
  const { name } = resolveCodeHost(opts.cwd, opts.git, opts.override)
  const tool = name === 'github' ? 'gh' : 'curl'
  if (find(tool) === undefined) return missing(tool)
  if (!opts.repoGiven) {
    const url = new Git(opts.cwd, { runner: opts.git }).soft.remoteGetUrl(opts.remote)
    const advice =
      'Run it inside a clone, name another remote with --remote, or pass --repo owner/name.'
    if (url === null) {
      return noRemote(`pr-update could not read the git remote '${opts.remote}' here. ${advice}`)
    }
    if (remoteSlug(url) === null) {
      return noRemote(
        `pr-update could not tell which repository the git remote '${opts.remote}' names. ${advice}`,
      )
    }
  }
  return { ok: true, host: name }
}

function noRemote(message: string): PreflightResult {
  return { ok: false, failure: { exit: EXIT_NO_REMOTE, message } }
}

/** The one-line hint that follows a failed PR listing, by host. */
export function listingHint(host: CodeHostName, tokenEnv: string = FORGEJO_TOKEN_ENV): string {
  return host === 'github'
    ? 'gh failed. Check `gh auth status` and your network.'
    : `the Forgejo request failed. Check that ${tokenEnv} holds a valid token and that the host is reachable.`
}
