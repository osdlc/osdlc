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
  cwd: string
  /** `owner/name`. */
  repo: string
  /**
   * The repository's host, when it is not the checkout's own and not
   * github.com, such as a GitHub Enterprise host. Unset otherwise.
   */
  host?: string | undefined
}

/**
 * `gh` aimed at `host`. gh reads an `owner/name` given to `--repo` as a
 * repository on `GH_HOST`, else github.com, so a GitHub Enterprise target is
 * listed on its own host. typed-gh's `--repo` takes `owner/name` only.
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
 * A `SurveyEnv.codeHost` factory that picks GitHub or Forgejo from the
 * checkout's `origin` remote (or `override`), as `selectCodeHost` does. The
 * standalone CLI uses this. A library caller that passes its own `codeHost`
 * never calls it. A host that cannot be built (no remote, a remote that names
 * no repository, no Forgejo token) throws a `FailureError` carrying the code
 * host's own failure, which `@osdlc/cli-tool` prints with its exit code.
 */
export function selectedCodeHostFor(deps: {
  git: CommandRunner
  gh: CommandRunner
  curl?: CommandRunner | undefined
  override: CodeHostName | null
}): (target: CodeHostTarget) => CodeHost {
  return (target) => {
    const selected = selectCodeHost(target.cwd, {
      git: deps.git,
      gh: ghOn(deps.gh, target.host),
      ...(deps.curl !== undefined ? { curl: deps.curl } : {}),
      override: deps.override,
    })
    if (!selected.ok) throw new FailureError(selected.error)
    return selected.value
  }
}
