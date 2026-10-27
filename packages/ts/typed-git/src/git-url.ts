/**
 * Parse an arbitrary git repository reference (https, ssh, scp-style,
 * `owner/repo` shorthand, `github:owner/repo`, …) into its host, owner, and
 * project. It uses `hosted-git-info`, the parser npm itself uses for this.
 * Covers GitHub, GitLab, Bitbucket, and Sourcehut.
 */

// The ambient declaration must travel with this file: a consumer that pulls
// git-url.ts in transitively compiles it under its tsconfig, which does not
// list our sibling .d.ts, and the module resolves to untyped JS (TS7016).
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./hosted-git-info.d.ts" />

import hostedGitInfo from 'hosted-git-info'

import { parseRemoteUrl } from './remote-url.ts'

/** A parsed reference to a repo on a known git host. */
export interface GitHostInfo {
  /** Short host name, e.g. `"github"`. */
  type: string
  domain: string
  user: string | null
  project: string
  /** Branch/tag/sha suffix (`#v1.0.0`), or null when the input had none. */
  committish: string | null
}

/** Parse `ref`, or null when it doesn't match a known git host. */
export function parseGitUrl(ref: string): GitHostInfo | null {
  const info = hostedGitInfo.fromUrl(ref)
  if (info === undefined) return null
  return {
    type: info.type,
    domain: info.domain,
    user: info.user,
    project: info.project,
    committish: info.committish === '' ? null : info.committish,
  }
}

/** `ref` as a scp-style SSH clone URL (`git@github.com:owner/repo.git`), or null. */
export function gitSshUrl(ref: string): string | null {
  return hostedGitInfo.fromUrl(ref)?.ssh() ?? null
}

/** The repository a git remote names, and the host it is on. */
export interface RemoteRepo {
  /** The host, lower-cased and without a port: `github.com`, `git.example.com`. */
  host: string
  owner: string
  repo: string
}

/**
 * `{host, owner, repo}` from a git remote reference, or null when it names no
 * project (a local path, a single path segment).
 *
 * It reads a known host (GitHub, GitLab, Bitbucket, Sourcehut) with
 * {@link parseGitUrl} first, so `owner/repo` and `github:owner/repo`
 * shorthand read as GitHub and a GitLab nested group stays whole in `owner`
 * (`group/sub`). Any other clone URL, such as a GitHub Enterprise or a
 * self-hosted Forgejo remote, is read host-agnostically by `parseRemoteUrl`:
 * `host/owner/repo`, scp-style or `scheme://`, where `owner` is the second to
 * last path segment.
 *
 * Use it to read a remote into the repository it names. To decide which forge
 * a host is, compare `host`, never the URL text: `notgithub.com` is not
 * GitHub, and neither is a path that mentions `github.com`.
 */
export function parseRemoteRepo(url: string): RemoteRepo | null {
  const info = parseGitUrl(url)
  if (info !== null && info.user && info.project) {
    return { host: info.domain, owner: info.user, repo: info.project }
  }
  const remote = parseRemoteUrl(url)
  if (remote === null) return null
  return { host: remote.host.toLowerCase(), owner: remote.owner, repo: remote.repo }
}

export type CloneProtocol = 'https' | 'ssh'

/**
 * A hosted repository named by any reference a person might paste: one
 * coordinate and one clone URL.
 */
export interface RepoRef {
  /** `github.com`, `gitlab.com`, … */
  host: string
  owner: string
  repo: string
  /** What `git clone` is given. */
  cloneUrl: string
  /**
   * A branch or tag the input named (`#v1`, `/tree/<branch>`), or null. A
   * `/tree/` path is read to its first segment, so `feat/x` arrives as `feat`.
   */
  committish: string | null
}

const SSH_INPUT = /^(?:ssh:\/\/|[A-Za-z0-9._-]+@)/
const HTTP_INPUT = /^https?:\/\//i

/**
 * Reduce `input` to a {@link RepoRef}, or null when it names no hosted
 * repository (a local path, an unknown host).
 *
 * {@link parseGitUrl} reads clone URLs and shorthand but refuses the web
 * pages people often copy, such as a pull request, an issue or a file, because
 * it takes `/pull/12` as part of the project path. So an http(s) input that
 * fails to parse is retried with its path cut to `/<owner>/<repo>`. The owner
 * and repo are then found whatever page the URL came from.
 *
 * `protocol` decides the clone URL only for an input that carries none
 * (`owner/repo`, `github:owner/repo`); an explicit `https://…` or `git@…:`
 * input is cloned the way it was reached.
 */
export function parseRepoRef(input: string, protocol: CloneProtocol = 'https'): RepoRef | null {
  const text = input.trim()
  if (text === '') return null
  const info = parseGitUrl(text) ?? parseWebPage(text)
  if (info === null || !info.user || !info.project) return null
  const { domain: host, user: owner, project: repo } = info
  const kind: CloneProtocol = SSH_INPUT.test(text)
    ? 'ssh'
    : HTTP_INPUT.test(text)
      ? 'https'
      : protocol
  const cloneUrl =
    kind === 'ssh' ? `git@${host}:${owner}/${repo}.git` : `https://${host}/${owner}/${repo}.git`
  return { host, owner, repo, cloneUrl, committish: info.committish }
}

/**
 * A web page under a project, read as the project. A GitLab page
 * (`https://host/group/sub/repo/-/…`) is first cut at its `/-/`, which keeps a
 * nested group whole. When that names no project (a GitHub path can hold a `-`
 * segment too), the page is cut to its first two path segments instead.
 */
function parseWebPage(text: string): GitHostInfo | null {
  const gitlab = /^(https?:\/\/[^/?#]+(?:\/[^/?#]+){2,}?)\/-(?:[/?#].*)?$/i.exec(text)
  if (gitlab !== null) {
    const info = parseGitUrl(gitlab[1]!)
    if (info !== null && info.user && info.project) return info
  }
  return parseGitUrl(trimWebPath(text))
}

/** `https://host/a/b/anything…` → `https://host/a/b`; other inputs unchanged. */
function trimWebPath(text: string): string {
  const m = /^(https?:\/\/[^/?#]+\/[^/?#]+\/[^/?#]+)(?:[/?#].*)?$/i.exec(text)
  return m === null ? text : m[1]!
}
