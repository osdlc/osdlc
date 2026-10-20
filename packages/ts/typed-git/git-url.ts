/**
 * Parse an arbitrary git repository reference (https, ssh, scp-style,
 * `owner/repo` shorthand, `github:owner/repo`, …) into its host, owner, and
 * project, over `hosted-git-info` — the parser npm itself uses for the same
 * job. Covers GitHub, GitLab, Bitbucket, and Sourcehut.
 */

// The ambient declaration must travel with this file: a consumer that pulls
// git-url.ts in transitively compiles it under its tsconfig, which does not
// list our sibling .d.ts, and the module resolves to untyped JS (TS7016).
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./hosted-git-info.d.ts" />

import hostedGitInfo from 'hosted-git-info'

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
 * pages people actually copy — a pull request, an issue, a file — because it
 * takes `/pull/12` as part of the project path. So an http(s) input that
 * fails to parse is retried with its path cut to `/<owner>/<repo>`: the
 * coordinate survives whatever page it was copied from.
 *
 * `protocol` decides the clone URL only for an input that carries none
 * (`owner/repo`, `github:owner/repo`); an explicit `https://…` or `git@…:`
 * input is cloned the way it was reached.
 */
export function parseRepoRef(input: string, protocol: CloneProtocol = 'https'): RepoRef | null {
  const text = input.trim()
  if (text === '') return null
  const info = parseGitUrl(text) ?? parseGitUrl(trimWebPath(text))
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

/** `https://host/a/b/anything…` → `https://host/a/b`; other inputs unchanged. */
function trimWebPath(text: string): string {
  const m = /^(https?:\/\/[^/?#]+\/[^/?#]+\/[^/?#]+)(?:[/?#].*)?$/i.exec(text)
  return m === null ? text : m[1]!
}
