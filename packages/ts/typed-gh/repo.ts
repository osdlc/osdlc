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

/** A pull request coordinate: the repository and the PR's number within it. */
export interface PullRequestRef extends OwnerRepo {
  number: number
}

/**
 * The `{owner, repo, number}` a GitHub pull-request URL names, or null when
 * `url` is not one.
 *
 * Accepts `https://github.com/<owner>/<repo>/pull/<n>` with or without a
 * scheme, a `www.` prefix, a trailing slash, a sub-page (`/files`,
 * `/commits`), a query string or a fragment — every shape a browser's address
 * bar hands over. `parseGitUrl` is the wrong tool here: it reads `/pull/<n>`
 * as part of the project path.
 *
 * GitHub.com only. A GitHub Enterprise host is a different coordinate space
 * (the `gh` CLI needs `--hostname`), so it is not silently accepted.
 */
export function parsePrUrl(url: string): PullRequestRef | null {
  const m =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#].*)?$/i.exec(
      url.trim(),
    )
  if (m === null) return null
  const number = Number(m[3])
  if (!Number.isSafeInteger(number) || number <= 0) return null
  return { owner: m[1]!, repo: m[2]!.replace(/\.git$/, ''), number }
}
