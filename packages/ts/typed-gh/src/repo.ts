/**
 * Reading the GitHub owner and repository from a git remote, and a pull
 * request from a URL or what a person typed.
 *
 * `parseOwnerRepo` is `@osdlc/typed-git`'s `parseRemoteRepo` without the
 * host, so it reads every remote form typed-git reads (scp-style, a trailing
 * `.git`, an `ssh://` port, a bare `owner/repo`, an Enterprise host) and no
 * caller writes its own regex over `remote.origin.url`.
 */

import { parseRemoteRepo } from '@osdlc/typed-git'

import type { OwnerRepo } from './types.ts'

/**
 * `{owner, repo}` from any git remote reference, or null when it names no
 * project. Handles https, ssh, scp-style, and bare `owner/repo`.
 *
 * It is typed-git's `parseRemoteRepo` without the host: a clone URL on a host
 * `parseGitUrl` does not know, such as a GitHub Enterprise host or another
 * forge's `host/owner/repo`, is read host-agnostically. It does not check
 * that the host is GitHub; read `parseRemoteRepo(url).host` for that.
 */
export function parseOwnerRepo(remoteUrl: string): OwnerRepo | null {
  const remote = parseRemoteRepo(remoteUrl)
  return remote === null ? null : { owner: remote.owner, repo: remote.repo }
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
 * fragment, as copied from a browser's address bar. The host is
 * `github.com` (a `www.` prefix is dropped) or a GitHub Enterprise host such
 * as `github.acme.com` or `acme.ghe.com`. Without a scheme the host must
 * contain a dot. `parseGitUrl` does not fit here, because it reads
 * `/pull/<n>` as part of the project path.
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

/**
 * What a person typed to name a pull request, read by {@link parsePrRef}.
 *
 * - `number`: `42`, `#42`, or `owner/name#42` (then `repo` is set). For bare
 *   digits, `orBranch` holds the same text, since a branch can be named `42`.
 * - `url`: a pull request URL, with what {@link parsePrUrl} read from it.
 * - `branch`: any other text that is a valid branch name.
 */
export type PrRef =
  | { kind: 'number'; number: number; repo: OwnerRepo | null; orBranch: string | null }
  | ({ kind: 'url'; url: string } & PullRequestRef)
  | { kind: 'branch'; name: string }

/**
 * Read what a person typed to name a pull request: a number, `#42`,
 * `owner/name#42`, a URL, or a branch name. Null when it is none of these.
 *
 * It starts no process. Digits are read as a number first, the way
 * `gh pr view 42` reads them. `orBranch` keeps the text for reading it as a
 * branch. The clients' `prFind` tries both.
 */
export function parsePrRef(input: string): PrRef | null {
  const text = input.trim()
  const digits = /^(#?)(\d+)$/.exec(text)
  if (digits !== null) {
    const number = Number(digits[2])
    if (Number.isSafeInteger(number) && number > 0) {
      return { kind: 'number', number, repo: null, orBranch: digits[1] === '' ? text : null }
    }
  }
  const qualified = /^([^/\s#]+)\/([^/\s#]+)#(\d+)$/.exec(text)
  if (qualified !== null) {
    const number = Number(qualified[3])
    if (!Number.isSafeInteger(number) || number <= 0) return null
    if (!isRepoSlug(`${qualified[1]}/${qualified[2]}`)) return null
    return {
      kind: 'number',
      number,
      repo: { owner: qualified[1]!, repo: qualified[2]! },
      orBranch: null,
    }
  }
  const url = parsePrUrl(text)
  if (url !== null) return { kind: 'url', url: text, ...url }
  return isBranchName(text) ? { kind: 'branch', name: text } : null
}

/** True for `owner/name` as GitHub spells it. */
export function isRepoSlug(text: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.][A-Za-z0-9_.-]*$/.test(text)
}

/**
 * True when `name` is a branch name git would accept (`git check-ref-format
 * --branch`), and does not start with `-`, so it cannot read as a flag.
 */
function isBranchName(name: string): boolean {
  if (name === '' || name === '@' || name.startsWith('-') || name.startsWith('/')) return false
  if (name.endsWith('/') || name.endsWith('.')) return false
  // Control characters, space, and the characters git reserves.
  // oxlint-disable-next-line no-control-regex
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(name)) return false
  if (name.includes('..') || name.includes('@{') || name.includes('//')) return false
  return name.split('/').every((part) => !part.startsWith('.') && !part.endsWith('.lock'))
}
