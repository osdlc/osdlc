/**
 * The default code host for a survey: GitHub, reached through `gh`.
 *
 * This is the one place `pr-update` names a concrete code host. Everything else
 * reads PRs through the `CodeHost` port (`@osdlc/code-host`). To survey through
 * another adapter, supply `SurveyEnv.codeHost`.
 */

import { GithubCodeHost, selectCodeHost, type CodeHost, type CodeHostName } from '@osdlc/code-host'
import type { CommandRunner } from '@osdlc/command-seam'
import { FailureError } from '@osdlc/result'

/** What a `SurveyEnv.codeHost` factory is asked for: a repository, and the checkout to run from. */
export interface CodeHostTarget {
  /** The checkout to run from: the target's own, or the project root when it has none. */
  cwd: string
  /** `owner/name`. */
  repo: string
  /**
   * The host of a target other than the project root, github.com included.
   * Unset for the project root, whose host is its remote's.
   */
  host?: string | undefined
  /**
   * For a target other than the project root: whether `host` is the project
   * root's host. Such a target is listed through the project root's code host;
   * a target on any other host through GitHub on `host`.
   */
  onRootHost?: boolean | undefined
}

/**
 * `gh` aimed at `host`. gh reads an `owner/name` given to `--repo` as a
 * repository on `GH_HOST` when that is set, else on its default host, so
 * `GH_HOST` is set even for github.com: one the person exported would
 * otherwise win. typed-gh's `--repo` takes `owner/name` only.
 */
function ghOn(gh: CommandRunner, host: string | undefined): CommandRunner {
  if (host === undefined) return gh
  return {
    ...gh,
    run: (argv, opts) => gh.run(argv, { ...opts, env: { ...opts?.env, GH_HOST: host } }),
  }
}

/** A `SurveyEnv.codeHost` factory that builds a `GithubCodeHost` over `gh`. */
export function githubCodeHostFor(gh: CommandRunner): (target: CodeHostTarget) => CodeHost {
  return (target) => new GithubCodeHost(target.cwd, { runner: ghOn(gh, target.host) })
}

/**
 * A `SurveyEnv.codeHost` factory. The project root's code host is GitHub or
 * Forgejo, picked from `projectRoot`'s `origin` remote (or `override`), as
 * `selectCodeHost` does. A target on the project root's host is listed
 * through that same code host. A target on any other host is listed through
 * GitHub on that host, whatever the project root is: a Forgejo target on
 * another host is not supported. The target's own checkout is never asked.
 *
 * The standalone CLI uses this. A library caller that passes its own
 * `codeHost` never calls it. A host that cannot be built (no remote, a remote
 * that names no repository, no Forgejo token) throws a `FailureError`
 * carrying the code host's own failure, which `@osdlc/cli-tool` prints with
 * its exit code.
 */
export function selectedCodeHostFor(deps: {
  projectRoot: string
  git: CommandRunner
  gh: CommandRunner
  curl?: CommandRunner | undefined
  override: CodeHostName | null
}): (target: CodeHostTarget) => CodeHost {
  return (target) => {
    if (target.host !== undefined && target.onRootHost !== true) {
      return new GithubCodeHost(target.cwd, { runner: ghOn(deps.gh, target.host) })
    }
    const selected = selectCodeHost(target.host === undefined ? target.cwd : deps.projectRoot, {
      git: deps.git,
      gh: ghOn(deps.gh, target.host),
      ...(deps.curl !== undefined ? { curl: deps.curl } : {}),
      override: deps.override,
    })
    if (!selected.ok) throw new FailureError(selected.error)
    return selected.value
  }
}
