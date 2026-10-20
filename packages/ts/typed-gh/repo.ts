/**
 * Turning a git remote into a GitHub coordinate.
 *
 * This is `@osdlc/typed-git`'s `parseGitUrl` applied to the one question a
 * GitHub client always ends up asking. It lives here rather than in each
 * caller because the hand-rolled version is always a regex over
 * `remote.origin.url`, and that regex is always missing a URL shape —
 * scp-style, a trailing `.git`, an `ssh://` port, a bare `owner/repo`.
 */

import { parseGitUrl } from '@osdlc/typed-git'

import type { OwnerRepo } from './types.ts'

/**
 * `{owner, repo}` from any git remote reference, or null when it names no
 * project. Handles https, ssh, scp-style, and bare `owner/repo`.
 */
export function parseOwnerRepo(remoteUrl: string): OwnerRepo | null {
  const info = parseGitUrl(remoteUrl)
  if (info === null) return null
  const { user, project } = info
  if (!user || !project) return null
  return { owner: user, repo: project }
}

/** `owner/repo`, the form `gh api` paths and `--repo` both take. */
export function ownerRepoSlug(r: OwnerRepo): string {
  return `${r.owner}/${r.repo}`
}

/** A pull request coordinate: the host, the repository and the PR's number within it. */
export interface PullRequestRef extends OwnerRepo {
  /** The GitHub host, lower-cased: `github.com`, or an Enterprise host. */
  hostname: string
  number: number
}

/**
 * The `{hostname, owner, repo, number}` a GitHub pull-request URL names, or
 * null when `url` is not one.
 *
 * Accepts `https://<host>/<owner>/<repo>/pull/<n>` with or without a scheme,
 * a trailing slash, a sub-page (`/files`, `/commits`), a query string or a
 * fragment — every shape a browser's address bar hands over. The host is
 * `github.com` (a `www.` prefix is dropped) or a GitHub Enterprise host such
 * as `github.acme.com` or `acme.ghe.com`; without a scheme the host must
 * contain a dot. `parseGitUrl` is the wrong tool here: it reads `/pull/<n>`
 * as part of the project path.
 */
export function parsePrUrl(url: string): PullRequestRef | null {
  const m =
    /^(?:(https?:)\/\/)?([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d+)?)\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i.exec(
      url.trim(),
    )
  if (m === null) return null
  const host = m[2]!.toLowerCase()
  if (m[1] === undefined && !host.includes('.')) return null
  const number = Number(m[5])
  if (!Number.isSafeInteger(number) || number <= 0) return null
  return {
    hostname: host === 'www.github.com' ? 'github.com' : host,
    owner: m[3]!,
    repo: m[4]!.replace(/\.git$/, ''),
    number,
  }
}
