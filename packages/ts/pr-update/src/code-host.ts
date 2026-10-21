/**
 * The default code host for a survey: GitHub, reached through `gh`.
 *
 * The one place `pr-update` names a concrete code host. Everything else reads
 * PRs through the `CodeHost` port (`@osdlc/code-host`), so a different
 * adapter reaches the survey by supplying `SurveyEnv.codeHost` instead.
 */

import { GithubCodeHost, type CodeHost } from '@osdlc/code-host'
import type { CommandRunner } from '@osdlc/command-seam'

/** A `SurveyEnv.codeHost` factory that builds a `GithubCodeHost` over `gh`. */
export function githubCodeHostFor(
  gh: CommandRunner,
): (target: { cwd: string; slug: string }) => CodeHost {
  return (target) => new GithubCodeHost(target.cwd, { runner: gh })
}
