/**
 * Host-agnostic reading of a git remote URL into its coordinate.
 *
 * `parseGitUrl` (git-url.ts) is over `hosted-git-info`, which only knows a
 * fixed allowlist of hosts and answers null for a self-hosted Forgejo or
 * Gitea. A remote read out of a checkout's own config is always a clone URL
 * (scp-style or `scheme://`), so this parses that shape for ANY host and
 * needs no dependency — which is why it, not `parseGitUrl`, backs
 * `Git.remoteOwnerRepo` and stays on the `./client` entry.
 */

/** A remote clone URL split into where it lives and what it names. */
export interface RemoteCoordinate {
  owner: string
  repo: string
  host: string
  /** The port of an `http(s)://` remote, or null. scp-style has none; `ssh://` ports are not carried. */
  port: number | null
}

/**
 * Parses `git@host:owner/repo.git` (scp-style) and
 * `scheme://[user@]host[:port]/owner/repo[.git]`. The last two path segments
 * are the owner and repo, so a nested group (`group/sub/repo`) answers
 * `owner: "sub"`. Returns null for anything else (a local path, a single
 * path segment).
 *
 * Only an `http(s)://` port is read. An `ssh://` port is dropped, so `port` is
 * null for `ssh://git@host:2222/owner/repo.git`.
 */
export function parseRemoteUrl(url: string): RemoteCoordinate | null {
  const trimmed = url.trim()
  const scp = /^[\w.-]+@([^:/]+):(.+)$/.exec(trimmed)
  const uri = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::(\d+))?\/(.+)$/i.exec(trimmed)
  const match = scp ?? uri
  if (match === null) return null
  const host = match[1]!
  // `scp` has no port syntax: its `:` separates host and path.
  const isHttp = match === uri && /^https?:/i.test(trimmed)
  const port = isHttp && match[2] !== undefined ? Number(match[2]) : null
  const rest = match === uri ? match[3]! : match[2]!
  const path = rest.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '')
  const parts = path.split('/').filter((p) => p !== '')
  if (parts.length < 2) return null
  return { host, port, owner: parts[parts.length - 2]!, repo: parts[parts.length - 1]! }
}
