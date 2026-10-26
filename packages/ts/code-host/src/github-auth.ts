import { parseRemoteUrl } from '@osdlc/typed-git'
import { Gh } from '@osdlc/typed-gh'

import { isGithubHost } from './github-host.ts'
import type { AuthCheck, CodeHostAuthCheckDeps } from './types.ts'

/** Name of the `gh --version` check. A doctor command finds the result of its gh check by this name. */
export const GH_INSTALLED_CHECK = 'gh installed'

/** Name of the check that the `origin` remote is a GitHub repository. */
export const GH_REMOTE_CHECK = 'remote'

/**
 * Ok when `remoteUrl` parses as a repository on GitHub's host: `github.com` or a subdomain
 * of it, by the same rule host selection uses. A GitHub Enterprise origin fails this check
 * (pinned by a test). The fix adds `origin` when there is none and repoints it when it names
 * another host.
 */
function remoteCheck(remoteUrl: string | null): AuthCheck {
  const ref = remoteUrl === null ? null : parseRemoteUrl(remoteUrl)
  return {
    name: GH_REMOTE_CHECK,
    ok: ref !== null && isGithubHost(ref.host),
    ...(remoteUrl !== null ? { detail: remoteUrl } : {}),
    fix: remoteUrl === null ? 'git remote add origin <url>' : 'git remote set-url origin <url>',
  }
}

/**
 * `gh` is installed and logged in, and `origin` (`remoteUrl`, null when the checkout has none)
 * is a repository on `github.com` or a subdomain of it. The login check is skipped when `gh`
 * is missing.
 */
export function githubAuthChecks(
  deps: CodeHostAuthCheckDeps,
  remoteUrl: string | null,
): AuthCheck[] {
  const gh = new Gh(process.cwd(), { runner: deps.gh })
  const installed = gh.installed()
  const checks: AuthCheck[] = [
    { name: GH_INSTALLED_CHECK, ok: installed, fix: 'install gh: https://cli.github.com' },
  ]
  if (!installed) return [...checks, remoteCheck(remoteUrl)]
  const { ok, detail } = gh.authStatus()
  const firstLine = detail.split('\n')[0]
  checks.push({
    name: 'gh auth status',
    ok,
    ...(!ok && firstLine ? { detail: firstLine } : {}),
    fix: 'run: gh auth login',
  })
  checks.push(remoteCheck(remoteUrl))
  return checks
}
