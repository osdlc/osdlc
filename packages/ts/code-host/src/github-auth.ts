import { parseRemoteUrl } from '@osdlc/typed-git'
import { Gh } from '@osdlc/typed-gh'

import type { AuthCheck, CodeHostAuthCheckDeps } from './types.ts'

/** Name of the `gh --version` check. A doctor command finds the result of its gh check by this name. */
export const GH_INSTALLED_CHECK = 'gh installed'

/** Name of the check that the `origin` remote is a `github.com` repository. */
export const GH_REMOTE_CHECK = 'remote'

/**
 * Ok when `remoteUrl` parses as a `github.com` repository. Only `github.com` counts, so a
 * GitHub Enterprise origin fails this check (pinned by a test). The fix adds `origin` when
 * there is none and repoints it when it names another host.
 */
function remoteCheck(remoteUrl: string | null): AuthCheck {
  const ref = remoteUrl === null ? null : parseRemoteUrl(remoteUrl)
  return {
    name: GH_REMOTE_CHECK,
    ok: ref !== null && ref.host === 'github.com',
    ...(remoteUrl !== null ? { detail: remoteUrl } : {}),
    fix: remoteUrl === null ? 'git remote add origin <url>' : 'git remote set-url origin <url>',
  }
}

/**
 * `gh` is installed and logged in, and `origin` (`remoteUrl`, null when the checkout has none)
 * is a `github.com` repository. The login check is skipped when `gh` is missing.
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
