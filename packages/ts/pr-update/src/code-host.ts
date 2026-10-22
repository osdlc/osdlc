/**
 * The default code host for a survey: GitHub, reached through `gh`.
 *
 * The one place `pr-update` names a concrete code host. Everything else reads
 * PRs through the `CodeHost` port (`@osdlc/code-host`), so a different
 * adapter reaches the survey by supplying `SurveyEnv.codeHost` instead.
 */

import { GithubCodeHost, selectCodeHost, type CodeHost, type CodeHostName } from '@osdlc/code-host'
import type { CommandRunner } from '@osdlc/command-seam'
import { FailureError } from '@osdlc/result'

/** A `SurveyEnv.codeHost` factory that builds a `GithubCodeHost` over `gh`. */
export function githubCodeHostFor(
  gh: CommandRunner,
): (target: { cwd: string; slug: string }) => CodeHost {
  return (target) => new GithubCodeHost(target.cwd, { runner: gh })
}

/**
 * A `SurveyEnv.codeHost` factory that picks GitHub or Forgejo from the
 * checkout's `origin` remote (or `override`), as `selectCodeHost` does. The
 * standalone CLI uses this; a library caller that injects its own `codeHost`
 * never reaches it. A host that cannot be built (no remote, a remote that names
 * no repository, no Forgejo token) throws a `FailureError` carrying the code
 * host's own failure, which `@osdlc/cli-tool` renders and numbers.
 */
export function selectedCodeHostFor(deps: {
  git: CommandRunner
  gh: CommandRunner
  curl?: CommandRunner | undefined
  override: CodeHostName | null
}): (target: { cwd: string; slug: string }) => CodeHost {
  return (target) => {
    const selected = selectCodeHost(target.cwd, {
      git: deps.git,
      gh: deps.gh,
      ...(deps.curl !== undefined ? { curl: deps.curl } : {}),
      override: deps.override,
    })
    if (!selected.ok) throw new FailureError(selected.error)
    return selected.value
  }
}
